'use strict'
/* eslint-env browser */

const IsIpfs = require('is-ipfs')

function safeIpfsPath (urlOrPath) {
  if (IsIpfs.subdomain(urlOrPath)) {
    urlOrPath = subdomainToIpfsPath(urlOrPath)
  }
  // better safe than sorry: https://github.com/ipfs/ipfs-companion/issues/303
  return decodeURIComponent(urlOrPath.replace(/^.*(\/ip(f|n)s\/.+)$/, '$1'))
}
exports.safeIpfsPath = safeIpfsPath

function subdomainToIpfsPath (url) {
  if (typeof url === 'string') {
    url = new URL(url)
  }
  const fqdn = url.hostname.split('.')
  const cid = fqdn[0]
  const protocol = fqdn[1]
  return `/${protocol}/${cid}${url.pathname}`
}

function pathAtHttpGateway (path, gatewayUrl) {
  // return URL without duplicated slashes
  return trimDoubleSlashes(new URL(`${gatewayUrl}${path}`).toString())
}
exports.pathAtHttpGateway = pathAtHttpGateway

function trimDoubleSlashes (urlString) {
  return urlString.replace(/([^:]\/)\/+/g, '$1')
}
exports.trimDoubleSlashes = trimDoubleSlashes

function trimHashAndSearch (urlString) {
  // https://github.com/ipfs-shipyard/ipfs-companion/issues/567
  return urlString.split('#')[0].split('?')[0]
}
exports.trimHashAndSearch = trimHashAndSearch

function createIpfsPathValidator (getState, dnsLink) {
  const ipfsPathValidator = {
    // Test if URL is a Public IPFS resource
    // (pass validIpfsOrIpnsUrl(url) and not at the local gateway or API)
    publicIpfsOrIpnsResource (url) {
      // exclude custom gateway and api, otherwise we have infinite loops
      if (!url.startsWith(getState().gwURLString) && !url.startsWith(getState().apiURLString)) {
        return validIpfsOrIpnsUrl(url, dnsLink)
      }
      return false
    },

    // Test if URL is a valid IPFS or IPNS
    // (IPFS needs to be a CID, IPNS can be PeerId or have dnslink entry)
    validIpfsOrIpnsUrl (url) {
      return validIpfsOrIpnsUrl(url, dnsLink)
    },

    // Same as validIpfsOrIpnsUrl (url) but for paths
    // (we have separate methods to avoid 'new URL' where possible)
    validIpfsOrIpnsPath (path) {
      return validIpfsOrIpnsPath(path, dnsLink)
    },

    // Test if actions such as 'copy URL', 'pin/unpin' should be enabled for the URL
    // TODO: include hostname check for DNSLink and display option to copy CID even if no redirect
    isIpfsPageActionsContext (url) {
      return (IsIpfs.url(url) && !url.startsWith(getState().apiURLString)) || IsIpfs.subdomain(url)
    },

    // Test if actions such as 'per site redirect toggle' should be enabled for the URL
    isRedirectPageActionsContext (url) {
      const state = getState()
      return state.active && // show  only when actionable
      state.ipfsNodeType === 'external' && // hide with embedded node
      (IsIpfs.ipnsUrl(url) || // show on /ipns/<fqdn>
        (url.startsWith('http') && // hide on non-HTTP pages
         !url.startsWith(state.gwURLString) && // hide on /ipfs/*
          !url.startsWith(state.apiURLString))) // hide on api port
    }
  }

  return ipfsPathValidator
}

exports.createIpfsPathValidator = createIpfsPathValidator

function validIpfsOrIpnsUrl (url, dnsLink) {
  // `/ipfs/` is easy to validate, we just check if CID is correct
  if (IsIpfs.ipfsUrl(url)) {
    return true
  }
  // `/ipns/` requires multiple stages/branches (can be FQDN with dnslink or CID)
  if (validIpnsPath(new URL(url).pathname, dnsLink)) {
    return true
  }
  // everything else is not IPFS-related
  return false
}

function validIpfsOrIpnsPath (path, dnsLink) {
  // `/ipfs/` is easy to validate, we just check if CID is correct
  if (IsIpfs.ipfsPath(path)) {
    return true
  }
  // `/ipns/` requires multiple stages/branches (can be FQDN with dnslink or CID)
  if (validIpnsPath(path, dnsLink)) {
    return true
  }
  // everything else is not IPFS-related
  return false
}

function validIpnsPath (path, dnsLink) {
  if (IsIpfs.ipnsPath(path)) {
    // we may have false-positives here, so we do additional checks below
    const ipnsRoot = path.match(/^\/ipns\/([^/]+)/)[1]
    // console.log('==> IPNS root', ipnsRoot)
    // first check if root is a regular CID
    if (IsIpfs.cid(ipnsRoot)) {
      // console.log('==> IPNS is a valid CID', ipnsRoot)
      return true
    }
    // then see if there is an DNSLink entry for 'ipnsRoot' hostname
    if (dnsLink.readAndCacheDnslink(ipnsRoot)) {
      // console.log('==> IPNS for FQDN with valid dnslink: ', ipnsRoot)
      return true
    }
  }
  return false
}
