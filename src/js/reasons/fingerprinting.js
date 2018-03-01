"use strict";

[(function(exports) {

const {Action} = require('../schemes'),
  {log} = require('../utils'),
  {sendUrlDeactivate} = require('./utils'),
  {URL, tabsSendMessage} = require('../shim'),
  {FINGERPRINTING, USER_URL_DEACTIVATE, CANCEL} = require('../constants');

function isDeactivated(action) {
  return action && action.reason && action.reason === USER_URL_DEACTIVATE;
}

function fingerPrintingRequestHandler({tabs}, details) {
  log(`request for fingerprinting script seen at ${details.url}`);
  if (tabs.isThirdParty(details.tabId, details.urlObj.hostname)) {
    log(`blocking 3rd party fingerprinting request`);
    Object.assign(details, {response: CANCEL, shortCircuit: false});
  } else {
    // send set fp signal
    let {tabId, frameId} = details;
    if (tabId >= 0) {
      log(`intercepting 1st party fingerprinting script for
        tabId: ${tabId}, url: ${details.url}, and frameId ${frameId}`);
      tabs.markAction({reason: FINGERPRINTING}, details.url, details.tabId);
      tabsSendMessage(tabId, {type: 'firstparty-fingerprinting', url: details.url}, {frameId});
    } else {
      log(`Error: fingerprinting request from negative tabId, why does this happen`);
    }
  }
}

async function onFingerPrinting({store, tabs}, message, sender) {
  let tabId = sender.tab.id,
    {frameId} = sender,
    {url} = message,
    type = 'script';

  log(`received fingerprinting message from tab '${sender.tab.url}' for url '${url}'`);
  // NB: the url could be dangerous user input, so we check it is an existing resource.
  if (tabs.hasResource({tabId, frameId, url, type})) {
    let reason = FINGERPRINTING,
      frameUrl = tabs.getFrameUrl(tabId, frameId),
      tabUrl = tabs.getTabUrl(sender.tab.id),
      {href} = new URL(url),
      currentAction = await store.getUrl(href);

    if (!isDeactivated(currentAction)) {
      log(`store fingerprinting data`);
      tabs.markAction({reason: FINGERPRINTING}, href, sender.tab.id);
      await store.setUrl(href, new Action(reason, {href, frameUrl, tabUrl}));
    } else {
      log(`ignoring fingerprinting message because this url is deactivated`);
    }
  }
}

const fingerPrintingReason = {
  name: FINGERPRINTING,
  props: {
    requestHandler: fingerPrintingRequestHandler,
    messageHandler: onFingerPrinting,
    popupHandler: sendUrlDeactivate,
    popup_info: {
      icon: '/media/fingerprinting-icon.png',
      message: 'fingerprinting detected and blocked',
      attribution: "CCBY Ciprian Popescu, RO",
    }
  },
};

Object.assign(exports, {fingerPrintingReason});

})].map(func => typeof exports == 'undefined' ? define('/reasons/fingerprinting', func) : func(exports));

