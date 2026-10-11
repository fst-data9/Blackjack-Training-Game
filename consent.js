// Google's Privacy & messaging CMP. No CMP or advertising requests with ads off.
(() => {
    'use strict';

    function createAdapter({ tcfapi, notify, setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 5000 }) {
        let timer;
        let failed = false;
        let previous;
        const emit = ready => {
            if (previous === ready) return;
            previous = ready;
            notify(ready);
        };
        const fail = () => {
            failed = true;
            clearTimer(timer);
            emit(false);
        };
        const arm = () => {
            clearTimer(timer);
            timer = setTimer(fail, timeoutMs);
        };
        const onData = (data, success) => {
            if (failed) return;
            if (success !== true || !data || data.cmpStatus === 'error') return fail();
            // The IAB specifies a reduced TCData object outside GDPR, which
            // may omit cmpStatus, eventStatus and tcString altogether.
            if (data.gdprApplies === false && (data.cmpStatus === undefined || data.cmpStatus === 'loaded')) {
                clearTimer(timer);
                emit(true);
                return;
            }
            // Loading/stub data or an unknown jurisdiction cannot authorise ads.
            if (data.cmpStatus !== 'loaded' || typeof data.gdprApplies !== 'boolean') {
                emit(false);
                return;
            }
            // The CMP has loaded. The visitor may take as long as needed to
            // choose; a loading deadline must never become a consent deadline.
            if (data.eventStatus === 'cmpuishown') {
                clearTimer(timer);
                emit(false);
                return;
            }
            const ready = ['tcloaded', 'useractioncomplete'].includes(data.eventStatus) &&
                typeof data.tcString === 'string' && data.tcString.trim().length > 0;
            if (ready) clearTimer(timer);
            // True means TC data is ready, including a refusal. AdSense reads
            // the TC string itself; we do not infer personalised-ad consent.
            emit(ready);
        };
        arm();
        return {
            subscribe() {
                if (failed) return;
                try { tcfapi('addEventListener', 2, onData); }
                catch { fail(); }
            },
            fail,
            get failed() { return failed; },
            revoke() {
                if (failed) return false;
                emit(false);
                arm();
                return true;
            },
        };
    }

    let started = false;
    function start(config) {
        if (started || config?.enabled !== true || !/^ca-pub-\d{16}$/.test(config.publisher)) return;
        started = true;
        const adapter = createAdapter({
            tcfapi: (...args) => window.__tcfapi(...args),
            notify: detail => window.dispatchEvent(new CustomEvent('adsenseconsent', { detail })),
        });
        let apiReady = false;
        try {
            window.googlefc = window.googlefc || {};
            window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
            window.googlefc.callbackQueue.push({ CONSENT_API_READY: () => {
                if (adapter.failed) return;
                apiReady = true;
                adapter.subscribe();
            } });
            document.getElementById('privacySettingsLink')?.addEventListener('click', event => {
                // With no working CMP, the normal link opens the privacy page.
                if (!apiReady || adapter.failed) return;
                event.preventDefault();
                adapter.revoke();
                try {
                    // googlefc methods must run through its documented queue.
                    window.googlefc.callbackQueue.push({ CONSENT_API_READY: () => {
                        try { window.googlefc.showRevocationMessage(); }
                        catch { adapter.fail(); }
                    } });
                } catch { adapter.fail(); }
            });

            // Google tag's presence marker avoids a second CMP bootstrap when
            // AdSense eventually loads. It contains no user-visible content.
            if (!window.frames.googlefcPresent) {
                const marker = document.createElement('iframe');
                marker.name = 'googlefcPresent';
                marker.title = 'Google consent management presence';
                marker.hidden = true;
                marker.setAttribute('aria-hidden', 'true');
                document.body.append(marker);
            }
            const script = document.createElement('script');
            script.async = true;
            const nonce = document.querySelector('script[src="consent.js"]')?.nonce;
            if (nonce) script.nonce = nonce;
            script.src = `https://fundingchoicesmessages.google.com/i/${config.publisher.slice(3)}?ers=1`;
            script.onerror = adapter.fail;
            document.head.append(script);
        } catch { adapter.fail(); }
    }

    window.BlackjackConsent = { createAdapter, start };
})();
