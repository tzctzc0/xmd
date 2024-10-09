const itemsEl = document.getElementById('items')

chrome.devtools.network.onRequestFinished.addListener(req => {
	if (req.request.url.includes('/TweetDetail')) {
		req.getContent(body => {
			const data = JSON.parse(body)
			// console.log('/TweetDetail', data)
			const insts = data
				.data
				.threaded_conversation_with_injections_v2
				.instructions
			itemsEl.append(...createTweetItemEls(insts))
			itemsEl.scrollTop = itemsEl.scrollHeight
		})
	} else if (req.request.url.includes('/UserTweets')) {
		req.getContent(body => {
			const data = JSON.parse(body)
			// console.log('/UserTweets', data)
			const insts = data
				.data
				.user
				.result
				.timeline_v2
				.timeline
				.instructions
			itemsEl.append(...createTweetItemEls(insts))
			itemsEl.scrollTop = itemsEl.scrollHeight
		})
	}
})

const createTweetItemEls = instructions => {
	const results = []
	const tweetEntries = instructions
		.find(inst => inst.type === 'TimelineAddEntries')
		.entries
	for (const tweetEntry of tweetEntries) {
		if (tweetEntry.entryId.startsWith('tweet-')) {
			const mediaItem = createTweetItemEl(
				tweetEntry
					.content
					.itemContent
					.tweet_results
					.result
			)
			if (mediaItem) results.push(mediaItem)
		} else if (tweetEntry.entryId.startsWith('profile-conversation-')) {
			results.push(
				...tweetEntry.content.items
					.map(entry =>
						createTweetItemEl(
							entry
								.item
								.itemContent
								.tweet_results
								.result
						)
					)
					.filter(x => x !== null)
			)
		}
	}
	return results
}

const createTweetItemEl = tweet => {
	// 특정 기능이 제한된 트윗은 구조가 또 다름
	if (tweet.__typename === 'TweetWithVisibilityResults') tweet = tweet.tweet
	
	const isTombstone = tweet.__typename === 'TweetTombstone'
	if (isTombstone) return null
	
	const isRetweet = 'retweeted_status_result' in tweet.legacy
	if (isRetweet) return null
	
	// display_text_range는 코드 포인트 기준이므로
	// 멀티바이트 문자가 포함된 경우 문자열에 바로 .slice()하면 끝부분이 잘릴 수 있음
	const tweetContent =
		[...tweet.legacy.full_text]
			.slice(...tweet.legacy.display_text_range)
			.join('')
	const medias = tweet.legacy.entities.media ?? []
	
	const tweetEl = document.createElement('article')
	tweetEl.classList.add('tweet')
	
	const contentEl = document.createElement('main')
	const tweetHeaderEl = document.createElement('header')
	{
		tweetHeaderEl.classList.add('tweet-header')
		
		const tweetAuthorEl = document.createElement('span')
		tweetAuthorEl.classList.add('tweet-author')
		const tweetAuthor = tweet.core.user_results.result
		tweetAuthorEl.innerText = tweetAuthor.legacy.name
		
		const tweetPostedAtEl = document.createElement('span')
		tweetPostedAtEl.classList.add('tweet-posted-at')
		const tweetPostedAt = new Date(tweet.legacy.created_at)
		const now = new Date()
		const isSameYear = tweetPostedAt.getFullYear() === now.getFullYear()
		const opts = isSameYear
			? {
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric',
				second: 'numeric',
			}
			: { dateStyle: 'long' }
		const displayTweetPostedAt =
			new Intl.DateTimeFormat(undefined, opts)
				.format(tweetPostedAt)
		tweetPostedAtEl.innerText = `${displayTweetPostedAt} (${tweet.rest_id})`
		
		tweetHeaderEl.append(tweetAuthorEl, tweetPostedAtEl)
	}
	const tweetContentEl = document.createElement('main')
	tweetContentEl.classList.add('tweet-content')
	tweetContentEl.innerText = tweetContent
	
	contentEl.append(
		tweetHeaderEl,
		document.createElement('hr'),
		tweetContentEl,
	)
	
	const mediaListEl = document.createElement('ul')
	mediaListEl.classList.add('tweet-media-list')
	tweetEl.append(contentEl, mediaListEl)
	
	let i = 0
	for (const media of medias) {
		if (!['video', 'photo', 'animated_gif'].includes(media.type)) continue
		
		const mediaIdx = i
		if (document.querySelector(`[data-url="${media.expanded_url}"]`)) continue
		
		let downloadUrl
		let headContent
		let fileExt
		const originalSize = `${media.original_info.width}x${media.original_info.height}`
		if (media.type === 'photo') {
			let highestSizeName
			for (const sizeName in media.sizes) {
				const size = media.sizes[sizeName]
				const highestSize = media.sizes[highestSizeName]
				if (!highestSize || size.w * size.h > highestSize.w * highestSize.h) highestSizeName = sizeName
			}
			downloadUrl = `${media.media_url_https}?name=${highestSizeName}`
			headContent = `image / ${originalSize}`
			fileExt = 'jpg'
		} else {
			const videoInfo = media.video_info
			const bestVariant = videoInfo.variants
				.filter(v => v.content_type !== 'application/x-mpegURL')
				.sort((a, b) => b.bitrate - a.bitrate)
				[0]
			
			downloadUrl = bestVariant.url
			headContent =
				media.type === 'video'
					? `video / ${originalSize} / ${videoInfo.duration_millis}ms`
					: `GIF / ${originalSize}`
			fileExt = 'mp4'
		}
		const mediaItemEl = document.createElement('li')
		mediaItemEl.classList.add('media-item')
		mediaItemEl.dataset.url = media.expanded_url
		
		const downloadBtnEl = document.createElement('button')
		downloadBtnEl.innerText = 'Download'
		downloadBtnEl.addEventListener('click', () => {
			tweetEl.dataset.downloadStatus = 'pending'
			fetch(downloadUrl)
				.then(res => res.blob())
				.then(blob => {
					const linkEl = document.createElement('a')
					linkEl.href = URL.createObjectURL(blob)
					linkEl.download = `${tweet.rest_id}_${mediaIdx}.${fileExt}`
					document.body.append(linkEl)
					linkEl.click()
					linkEl.remove()
					tweetEl.dataset.downloadStatus = 'complete'
				})
				.catch(err => {
					console.error(err)
					tweetEl.dataset.downloadStatus = 'fail'
				})
		})
		
		const headEl = document.createElement('span')
		headEl.classList.add('head')
		headEl.innerText = headContent
		mediaItemEl.append(headEl, downloadBtnEl)
		mediaListEl.append(mediaItemEl)
		i++
	}
	
	return mediaListEl.children.length !== 0 ? tweetEl : null
}
