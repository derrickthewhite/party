export function getInitialRoute() {
    try {
        const params = new URL(location.href).searchParams;
        const adminUiRaw = String(params.get('admin_ui') || '').toLowerCase();
        return {
            screen: params.get('screen') || null,
            next: params.get('next') || null,
            game: params.get('game') || null,
            admin_ui_enabled: adminUiRaw === '1' || adminUiRaw === 'true',
        };
    } catch (e) {
        return { screen: null, next: null, game: null, admin_ui_enabled: false };
    }
}

export function isSafeNext(next) {
    if (!next || typeof next !== 'string') return false;

    // Disallow absolute URLs to other origins
    try {
        const maybe = new URL(next, location.origin);
        if (maybe.origin !== location.origin) return false;
    } catch (e) {
        return false;
    }

    // Allow same-origin absolute paths and hash fragments
    if (next.startsWith('/') || next.startsWith('#')) return true;

    // Otherwise be conservative and disallow
    return false;
}

export function isValidGameId(id) {
    if (!id) return false;
    return /^[0-9]+$/.test(String(id));
}
