async function readChatSnapshot(page) {
  return page.evaluate(() => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const messageNodes = Array.from(activeScreen.querySelectorAll('.message-item')).map((node) => ({
      username: (node.querySelector('.message-item-header small') || { textContent: '' }).textContent.split(' - ')[0].trim(),
      body: (node.querySelector('.message-item-body') || { textContent: '' }).textContent.trim(),
    }));
    const sidebarNames = (selector) => Array.from(activeScreen.querySelectorAll(selector)).map((node) => ({
      name: (node.querySelector('[data-ref="name"]') || { textContent: '' }).textContent.trim(),
      meta: (node.querySelector('[data-ref="meta"]') || { textContent: '' }).textContent.trim(),
    }));
    const sendButton = activeScreen.querySelector('[data-ref="sendButton"]');
    const feed = activeScreen.querySelector('[data-ref="feed"]');
    const feedStyle = window.getComputedStyle(feed);

    return {
      subtitle: (activeScreen.querySelector('[data-ref="subtitle"]') || { textContent: '' }).textContent.trim(),
      modeInfo: (activeScreen.querySelector('[data-ref="modeInfo"]') || { textContent: '' }).textContent.trim(),
      players: sidebarNames('.participant-sidebar [data-ref="playersList"] .participant-sidebar-item'),
      observers: sidebarNames('.participant-sidebar [data-ref="observersList"] .participant-sidebar-item'),
      messages: messageNodes,
      sendDisabled: !!(sendButton && sendButton.disabled),
      feedOverflowY: feedStyle.overflowY,
      feedClientHeight: feed.clientHeight,
      feedScrollHeight: feed.scrollHeight,
    };
  });
}

async function readDiplomacySnapshot(page) {
  return page.evaluate(() => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const endTurnButton = activeScreen.querySelector('[data-ref="endTurnBtn"]');
    const emptyOrdersNode = activeScreen.querySelector('[data-ref="emptyOrdersNode"]');
    const orders = Array.from(activeScreen.querySelectorAll('[data-ref="ordersList"] .message-item')).map((node) => ({
      meta: (node.querySelector('small') || { textContent: '' }).textContent.trim(),
      text: (node.querySelector('div') || { textContent: '' }).textContent.trim(),
    }));

    return {
      subtitle: (activeScreen.querySelector('[data-ref="subtitle"]') || { textContent: '' }).textContent.trim(),
      modeInfo: (activeScreen.querySelector('[data-ref="modeInfo"]') || { textContent: '' }).textContent.trim(),
      progressText: (activeScreen.querySelector('[data-ref="progressText"]') || { textContent: '' }).textContent.trim(),
      emptyOrdersText: emptyOrdersNode ? emptyOrdersNode.textContent.trim() : '',
      emptyOrdersVisible: !!(emptyOrdersNode && window.getComputedStyle(emptyOrdersNode).display !== 'none'),
      orders,
      sendDisabled: !!(activeScreen.querySelector('[data-ref="sendOrderBtn"]') || {}).disabled,
      endTurnVisible: !!(endTurnButton && window.getComputedStyle(endTurnButton).display !== 'none'),
      endTurnDisabled: !!(endTurnButton && endTurnButton.disabled),
    };
  });
}

async function readMafiaSnapshot(page) {
  return page.evaluate(() => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const visible = (selector) => {
      const node = activeScreen.querySelector(selector);
      if (!node) {
        return false;
      }
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const readyButton = activeScreen.querySelector('[data-ref="readyBtn"]');

    return {
      subtitle: (activeScreen.querySelector('[data-ref="subtitle"]') || { textContent: '' }).textContent.trim(),
      modeInfo: (activeScreen.querySelector('[data-ref="modeInfo"]') || { textContent: '' }).textContent.trim(),
      roleText: (activeScreen.querySelector('[data-ref="roleText"]') || { textContent: '' }).textContent.trim(),
      phaseText: (activeScreen.querySelector('[data-ref="phaseText"]') || { textContent: '' }).textContent.trim(),
      progressText: (activeScreen.querySelector('[data-ref="progressText"]') || { textContent: '' }).textContent.trim(),
      voteText: (activeScreen.querySelector('[data-ref="voteText"]') || { textContent: '' }).textContent.trim(),
      latestSummary: (activeScreen.querySelector('[data-ref="latestSummary"]') || { textContent: '' }).textContent.trim(),
      readyCardVisible: visible('[data-ref="readyCard"]'),
      voteCardVisible: visible('[data-ref="voteCard"]'),
      setupControlVisible: visible('[data-ref="setupControl"]'),
      withdrawVoteVisible: visible('[data-ref="withdrawVoteBtn"]'),
      readyButtonVisible: !!(readyButton && window.getComputedStyle(readyButton).display !== 'none'),
      readyButtonDisabled: !!(readyButton && readyButton.disabled),
      victoryVisible: visible('.mafia-victory-card'),
      targetNames: Array.from(activeScreen.querySelectorAll('.mafia-target-row [data-ref="name"]')).map((node) => node.textContent.trim()),
    };
  });
}

async function readRumbleSnapshot(page) {
  return page.evaluate(() => {
    const activeScreen = document.querySelector('.screen:not(.hidden)');
    const visible = (selector) => {
      const node = activeScreen.querySelector(selector);
      if (!node) {
        return false;
      }
      return window.getComputedStyle(node).display !== 'none';
    };

    const phaseButtons = ['submitBtn', 'editBtn', 'cancelBtn', 'phaseActionBtn'].map((ref) => {
      const node = activeScreen.querySelector(`[data-ref="${ref}"]`);
      return {
        ref,
        visible: !!node && window.getComputedStyle(node).display !== 'none',
        disabled: !!(node && node.disabled),
        text: node ? node.textContent.trim() : '',
      };
    });

    const playerRows = Array.from(activeScreen.querySelectorAll('.rumble-player-row')).map((node) => ({
      name: (node.querySelector('[data-ref="name"]') || { textContent: '' }).textContent.trim(),
      abilities: (node.querySelector('[data-ref="abilities"]') || { textContent: '' }).textContent.trim(),
    }));

    const targetOptions = Array.from(activeScreen.querySelectorAll('[data-ref="adminCheatTargetSelect"] option')).map((node) => node.textContent.trim());

    return {
      subtitle: (activeScreen.querySelector('[data-ref="subtitle"]') || { textContent: '' }).textContent.trim(),
      modeInfo: (activeScreen.querySelector('[data-ref="modeInfo"]') || { textContent: '' }).textContent.trim(),
      progressText: (activeScreen.querySelector('[data-ref="progressText"]') || { textContent: '' }).textContent.trim(),
      bidHelpVisible: visible('[data-ref="bidHelpText"]'),
      attackHelpVisible: visible('[data-ref="attackHelpText"]'),
      biddingCount: activeScreen.querySelectorAll('[data-ref="abilitiesList"] input').length,
      playerRows,
      phaseButtons,
      victoryVisible: visible('[data-ref="victoryMount"] section'),
      adminCheatToggleVisible: visible('[data-ref="adminCheatToggleRow"]'),
      adminCheatPanelVisible: visible('[data-ref="adminCheatPanel"]'),
      adminTargetOptions: targetOptions,
      adminAbilityRows: activeScreen.querySelectorAll('[data-ref="adminCheatAbilityList"] input[type="checkbox"]').length,
    };
  });
}

module.exports = {
  readChatSnapshot,
  readDiplomacySnapshot,
  readMafiaSnapshot,
  readRumbleSnapshot,
};