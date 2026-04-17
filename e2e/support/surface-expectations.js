function expectedLobbyButtons(game, sessionUserIsAdmin, adminUiEnabled) {
  const permissions = game.permissions || {};
  const memberRole = String(game.member_role || '').toLowerCase();
  const isOwner = memberRole === 'owner';
  const isOwnerOrAdmin = !!permissions.can_delete;
  const canSeeManageControls = isOwnerOrAdmin && (isOwner || !sessionUserIsAdmin || adminUiEnabled);
  const alreadyMember = !!game.is_member;
  const canOpen = alreadyMember || memberRole === 'observer';

  return {
    joinVisible: !!permissions.can_join_player,
    observeVisible: !!permissions.can_join_observer,
    leaveVisible: !!permissions.can_leave,
    openVisible: canOpen,
    startVisible: canSeeManageControls,
    endVisible: canSeeManageControls,
    removeVisible: canSeeManageControls,
  };
}

function phaseHeadingForGame(game, suffix) {
  return `${game.title} (${suffix})`;
}

module.exports = {
  expectedLobbyButtons,
  phaseHeadingForGame,
};