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
			itemsEl.append(...createVideoItemEls(insts))
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
			itemsEl.append(...createVideoItemEls(insts))
		})
	}
})

const createVideoItemEls = instructions => {
	const results = []
	const tweetEntries = instructions
		.find(inst => inst.type === 'TimelineAddEntries')
		.entries
	for (const tweetEntry of tweetEntries) {
		if (tweetEntry.entryId.startsWith('tweet-')) {
			const videoItem = createVideoItemEl(
				tweetEntry
					.content
					.itemContent
					.tweet_results
					.result
			)
			if (videoItem) results.push(videoItem)
		} else if (tweetEntry.entryId.startsWith('profile-conversation-')) {
			results.push(
				...tweetEntry.content.items
					.map(entry =>
						createVideoItemEl(
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

const createVideoItemEl = tweet => {
	const isRetweet = 'retweeted_status_result' in tweet.legacy
	if (isRetweet) return null
	
	const tweetContent = tweet.legacy.full_text
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
	
	const videoListEl = document.createElement('ul')
	videoListEl.classList.add('tweet-video-list')
	tweetEl.append(contentEl, videoListEl)
	
	let i = 0
	for (const media of medias) {
		if (media.type !== 'video') continue
		
		const videoIdx = i
		if (document.querySelector(`[data-url="${media.expanded_url}"]`)) continue
		
		const videoInfo = media.video_info
		const duration = videoInfo.duration_millis
		const bestVariant = videoInfo.variants
			.slice(1) // remove element containing mpeg url that we are not interested
			.sort((a, b) =>  b.bitrate - a.bitrate)
			[0]
		
		const videoItemEl = document.createElement('li')
		videoItemEl.classList.add('video-item')
		videoItemEl.dataset.url = media.expanded_url
		
		const downloadBtnEl = document.createElement('button')
		downloadBtnEl.innerText = 'Download'
		downloadBtnEl.addEventListener('click', () => {
			fetch(bestVariant.url)
				.then(res => res.blob())
				.then(blob => {
					const linkEl = document.createElement('a')
					linkEl.href = URL.createObjectURL(blob)
					linkEl.download = `${tweet.rest_id}_${videoIdx}.mp4`
					document.body.append(linkEl)
					linkEl.click()
					linkEl.remove()
				})
		})
		
		const headEl = document.createElement('span')
		headEl.classList.add('head')
		headEl.innerText = `Duration: ${duration}ms`
		
		videoItemEl.append(headEl, downloadBtnEl)
		videoListEl.append(videoItemEl)
		i++
	}
	
	return videoListEl.children.length !== 0 ? tweetEl : null
}
