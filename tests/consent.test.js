import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../consent.js', import.meta.url), 'utf8'), context);
const { createAdapter } = context.window.BlackjackConsent;

function harness({ throws = false } = {}) {
    let callback;
    let clock = 0;
    let nextId = 0;
    const timers = new Map();
    const events = [];
    const calls = [];
    const adapter = createAdapter({
        tcfapi(command, version, listener) {
            calls.push([command, version]);
            if (throws) throw new Error('CMP unavailable');
            callback = listener;
        },
        notify: ready => events.push(ready),
        setTimer: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, due: clock + delay }); return id; },
        clearTimer: id => timers.delete(id),
    });
    adapter.subscribe();
    return {
        adapter, events, calls,
        data: (data = {}, success = true) => callback({ cmpStatus: 'loaded', gdprApplies: true, eventStatus: 'tcloaded', tcString: 'FAKE_TC_STRING', ...data }, success),
        tick(ms) {
            clock += ms;
            for (const [id, timer] of timers) if (timer.due <= clock) { timers.delete(id); timer.fn(); }
        },
    };
}

for (const eventStatus of ['tcloaded', 'useractioncomplete']) {
    test(`${eventStatus} makes TC data ready, without interpreting personalisation choices`, () => {
        const h = harness();
        h.data({ eventStatus, purpose: { consents: { 1: false, 3: false, 4: false } }, vendor: { consents: { 755: false } } });
        h.tick(6000);
        assert.deepEqual(h.calls, [['addEventListener', 2]]);
        assert.deepEqual(h.events, [true]);
        assert.equal(h.adapter.failed, false);
    });
}

test('outside GDPR accepts the reduced IAB TCData object without a TC string or status fields', () => {
    const h = harness();
    h.data({ gdprApplies: false, tcString: undefined, eventStatus: undefined, cmpStatus: undefined });
    h.tick(6000);
    assert.deepEqual(h.events, [true]);
});

test('a silent CMP times out after five seconds and ignores late responses', () => {
    const h = harness();
    h.tick(4999);
    assert.deepEqual(h.events, []);
    h.tick(1);
    h.data();
    assert.deepEqual(h.events, [false]);
    assert.equal(h.adapter.failed, true);
});

test('a throwing TCF API fails immediately without escaping into gameplay', () => {
    const h = harness({ throws: true });
    h.tick(6000);
    assert.deepEqual(h.events, [false]);
    assert.equal(h.adapter.failed, true);
});

test('unsuccessful callbacks and CMP errors revoke readiness', () => {
    for (const [data, success] of [[{}, false], [{ cmpStatus: 'error' }, true]]) {
        const h = harness();
        h.data();
        h.data(data, success);
        h.data();
        assert.deepEqual(h.events, [true, false]);
        assert.equal(h.adapter.failed, true);
    }
});

test('stub and loading statuses never authorise ads, even outside GDPR', () => {
    for (const cmpStatus of ['stub', 'loading']) {
        const h = harness();
        h.data({ cmpStatus, gdprApplies: false });
        h.tick(5000);
        assert.deepEqual(h.events, [false]);
        assert.equal(h.adapter.failed, true);
    }
});

test('unknown jurisdiction and missing TC strings remain closed', () => {
    for (const data of [{ gdprApplies: undefined }, { gdprApplies: 'false' }, { cmpStatus: undefined }, { tcString: '' }, { tcString: ' ' }, { tcString: undefined }, { eventStatus: 'unknown' }]) {
        const h = harness();
        h.data(data);
        h.tick(5000);
        assert.deepEqual(h.events, [false]);
        assert.equal(h.adapter.failed, true);
    }
});

test('a displayed CMP removes the loading deadline while the visitor chooses', () => {
    const h = harness();
    h.data({ eventStatus: 'cmpuishown', tcString: '' });
    h.tick(30000);
    assert.deepEqual(h.events, [false]);
    assert.equal(h.adapter.failed, false);
    h.data({ eventStatus: 'useractioncomplete' });
    assert.deepEqual(h.events, [false, true]);
});

test('revocation pauses ads until a new choice arrives and deduplicates repeated status', () => {
    const h = harness();
    h.data();
    h.data();
    assert.equal(h.adapter.revoke(), true);
    h.data({ eventStatus: 'cmpuishown' });
    h.tick(10000);
    h.data({ eventStatus: 'useractioncomplete' });
    assert.deepEqual(h.events, [true, false, true]);
});

test('revocation fails closed if the CMP stops responding', () => {
    const h = harness();
    h.data();
    h.adapter.revoke();
    h.tick(5000);
    assert.equal(h.adapter.revoke(), false);
    assert.deepEqual(h.events, [true, false]);
});

test('a bootstrap error cannot later be overwritten by successful TC data', () => {
    const h = harness();
    h.adapter.fail();
    h.data();
    assert.deepEqual(h.events, [false]);
});
