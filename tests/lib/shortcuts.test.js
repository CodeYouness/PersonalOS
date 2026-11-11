/**
 * The iPhone Shortcuts, built as data (ADR 0034). What the phone does with
 * them is checked by hand (docs/shortcuts.md); these hold the properties a
 * hand check found and must not be lost on a rebuild.
 */
import { describe, expect, it } from 'vitest';

import { QUEUE_FILE, SHORTCUT_NAMES, buildShortcut, toXmlPlist } from '@/lib/shortcuts.js';

const HOST = 'https://mac.example.ts.net';

/** @param {string} name */
function actionsOf(name) {
  const shortcut = /** @type {any} */ (buildShortcut(name, { host: HOST }));
  return /** @type {Array<{ WFWorkflowActionIdentifier: string, WFWorkflowActionParameters: any }>} */ (
    shortcut.WFWorkflowActions
  ).map((action) => ({ id: action.WFWorkflowActionIdentifier.replace('is.workflow.actions.', ''), params: action.WFWorkflowActionParameters }));
}

/** @param {unknown} value */
function json(value) {
  return JSON.stringify(value);
}

describe('buildShortcut', () => {
  it.each(SHORTCUT_NAMES)('%s asks for the host and the token on import, and carries no token', (name) => {
    const shortcut = /** @type {any} */ (buildShortcut(name, { host: HOST }));

    expect(shortcut.WFWorkflowImportQuestions).toEqual([
      expect.objectContaining({ ActionIndex: 0, ParameterKey: 'WFTextActionText', DefaultValue: HOST }),
      expect.objectContaining({ ActionIndex: 2, ParameterKey: 'WFTextActionText', DefaultValue: '' }),
    ]);
    const actions = actionsOf(name);
    expect(actions[0]).toEqual({ id: 'gettext', params: expect.objectContaining({ WFTextActionText: HOST }) });
    expect(actions[2]).toEqual({ id: 'gettext', params: expect.objectContaining({ WFTextActionText: '' }) });
    // The host is the pre-filled answer and the first Text, nowhere else.
    expect(json(shortcut).split(HOST)).toHaveLength(3);
  });

  it.each(SHORTCUT_NAMES)('%s closes every If and Repeat it opens', (name) => {
    /** @type {Map<string, number[]>} */
    const groups = new Map();
    for (const { id, params } of actionsOf(name)) {
      if (id !== 'conditional' && id !== 'repeat.each') continue;
      groups.set(params.GroupingIdentifier, [...(groups.get(params.GroupingIdentifier) ?? []), params.WFControlFlowMode]);
    }
    for (const modes of groups.values()) {
      expect(modes[0]).toBe(0);
      expect(modes.at(-1)).toBe(2);
    }
  });

  it.each(SHORTCUT_NAMES)('%s saves the queue as JSON text, never through Set Dictionary Value', (name) => {
    const actions = actionsOf(name);

    expect(actions.some(({ id }) => id === 'setvalueforkey')).toBe(false);
    const saves = actions.filter(({ id }) => id === 'documentpicker.save');
    expect(saves.length).toBeGreaterThan(0);
    for (const { params } of saves) {
      expect(json(params.WFFileDestinationPath)).toContain(QUEUE_FILE);
      expect(params.WFSaveFileOverwrite).toBe(true);
    }
    expect(json(actions)).toContain('{\\"items\\":[]}');
  });

  it('compares the kind on a Text, never straight on a Dictionary Value', () => {
    const actions = actionsOf('Send queued');
    const at = actions.findIndex(({ id, params }) => id === 'conditional' && params.WFConditionalActionString === 'journal');
    const compared = actions[at].params.WFInput.Variable.Value;
    const source = actions.find(({ params }) => params.UUID === compared.OutputUUID);

    expect(compared.OutputName).toBe('Text');
    expect(source?.id).toBe('gettext');
  });

  it('files a capture with origin shortcut, and a journal entry without one', () => {
    const posts = actionsOf('Send queued').filter(({ id }) => id === 'downloadurl');
    const bodyKeys = (/** @type {any} */ post) =>
      post.params.WFJSONValues.Value.WFDictionaryFieldValueItems.map((/** @type {any} */ item) => item.WFKey.Value.string);

    expect(posts.map(({ params }) => params.WFURL.Value.string.slice(1))).toEqual(['/api/journal', '/api/capture']);
    expect(bodyKeys(posts[0])).toEqual(['text', 'saidAt', 'clientId']);
    expect(bodyKeys(posts[1])).toEqual(['text', 'saidAt', 'clientId', 'origin']);
    for (const { params } of posts) {
      expect(params.WFHTTPMethod).toBe('POST');
      expect(json(params.WFHTTPHeaders)).toContain('Bearer ');
    }
  });

  it.each([
    ['Capture', 'capture', 'After Pause'],
    ['Journal', 'journal', 'On Tap'],
  ])('%s saves the dictated sentence to the queue before anything touches the network', (name, kind, stop) => {
    const actions = actionsOf(name);
    const firstSave = actions.findIndex(({ id }) => id === 'documentpicker.save');
    const firstPost = actions.findIndex(({ id }) => id === 'downloadurl');

    expect(actions.find(({ id }) => id === 'dictatetext')?.params.WFDictateTextStopListening).toBe(stop);
    expect(json(actions)).toContain('"WFKey":{"Value":{"string":"kind","attachmentsByRange":{}},"WFSerializationType":"WFTextTokenString"},"WFValue":{"Value":{"string":"' + kind + '"');
    expect(firstSave).toBeGreaterThan(-1);
    expect(firstSave).toBeLessThan(firstPost);
  });

  it('refuses an unknown name and a host that is not a bare https URL', () => {
    expect(() => buildShortcut('Delete everything', { host: HOST })).toThrow(/unknown/);
    expect(() => buildShortcut('Capture', { host: 'http://mac.example.ts.net' })).toThrow(/host/);
    expect(() => buildShortcut('Capture', { host: HOST + '/api/capture' })).toThrow(/host/);
  });
});

describe('toXmlPlist', () => {
  it('writes strings escaped, integers, booleans and empty containers', () => {
    expect(toXmlPlist({ a: 'x & <y>', n: 4282601983, t: true, f: false, l: [], d: {} })).toContain(
      [
        '<dict>',
        '  <key>a</key>',
        '  <string>x &amp; &lt;y&gt;</string>',
        '  <key>n</key>',
        '  <integer>4282601983</integer>',
        '  <key>t</key>',
        '  <true/>',
        '  <key>f</key>',
        '  <false/>',
        '  <key>l</key>',
        '  <array/>',
        '  <key>d</key>',
        '  <dict/>',
        '</dict>',
      ].join('\n')
    );
  });

  it('refuses a number it cannot write as an integer', () => {
    expect(() => toXmlPlist({ x: 0.5 })).toThrow(/integers/);
  });
});
