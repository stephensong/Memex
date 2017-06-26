import { blobToArrayBuffer } from 'blob-util'

import db from 'src/pouchdb'
import { getPage } from 'src/search/find-pages'
import { getTimestamp } from 'src/activity-logger'
import shortUrl from 'src/util/short-url'
import niceTime from 'src/util/nice-time'
import syncLocationHashes from 'src/util/sync-location-hashes'


function fixChromiumInjectedStylesheet(document) {
    // Pragmatic workaround for Chromium, which appears to inject two style
    // rules into extension pages (with font-size: 75%, for some reason?).
    const styleEl = document.createElement('style')
    styleEl.innerHTML = `body {
        font-size: inherit;
        font-family: inherit;
    }`
    document.head.insertAdjacentElement('afterbegin', styleEl)
}

async function showPage(pageId) {
    const page = await getPage({pageId, followRedirects: true})
    if (page._id !== pageId) {
        // Apparently getPage followed one or more redirects. Reload the viewer
        // with the resolved page's id in the ?page query.
        const location = new URL(window.location)
        location.searchParams.set('page', page._id)
        window.location = location
    }
    const timestamp = getTimestamp(page)

    document.title = `💾 ${page.title}`
    const bar = document.getElementById('bar')
    const barContent = `<span>Snapshot of <a href="${page.url}">${shortUrl(page.url)}</a></span>`
        + `<span><time datetime="${new Date(timestamp)}">⌚ ${niceTime(timestamp)}</time></span>`
    bar.innerHTML = barContent

    // Read the html file from the database.
    const blob = await db.getAttachment(pageId, 'frozen-page.html')
    // We assume utf-8 encoding. TODO: read encoding from document.
    const html = new TextDecoder('utf-8').decode(await blobToArrayBuffer(blob))

    // Show the page in the iframe.
    const iframe = document.getElementById('page')
    iframe.srcdoc = html
    // XXX The DOMContentLoaded event would be better, but how to listen to that?
    iframe.onload = () => {
        const doc = iframe.contentDocument

        // Ensure a head element exists.
        if (!doc.head) {
            const head = doc.createElement('head')
            doc.documentElement.insertAdjacentElement('afterbegin', head)
        }

        // Make links open in the whole tab, not inside the iframe
        const baseEl = doc.createElement('base')
        baseEl.setAttribute('target', '_parent')
        doc.head.insertAdjacentElement('afterbegin', baseEl)

        // Workaround required for Chromium.
        fixChromiumInjectedStylesheet(doc)

        // Focus on the page so it receives e.g. keyboard input
        iframe.contentWindow.focus()

        // Keep the iframe's location #hash in sync with that of the window.
        syncLocationHashes([window, iframe.contentWindow], {initial: window})
    }
}

// Read pageId from location: ?page=pageId
const pageId = new URL(window.location).searchParams.get('page')
showPage(pageId)
