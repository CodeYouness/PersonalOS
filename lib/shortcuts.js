/**
 * The three iPhone Shortcuts -- Capture, Journal and Send queued -- built as
 * data (ADR 0036). `scripts/build-shortcuts.js` writes each one out, converts
 * it and signs it with macOS's `shortcuts sign`; nothing built here is
 * committed.
 *
 * No host and no token is written into a Shortcut. Each starts with two Text
 * actions that are import questions: the phone asks for them when the
 * Shortcut is added, and the host's answer is pre-filled with what the
 * script was given.
 *
 * What the Shortcuts do is in docs/shortcuts.md. Two lessons from the phone
 * are built in, because the editor silently drops what it cannot take:
 *
 * - a text comparison ("If kind is journal") is made on a Text action, never
 *   straight on a Dictionary Value, which loses its operand;
 * - the queue is saved as JSON text -- each item is a dictionary, and a
 *   dictionary turned into text is its JSON -- never through Set Dictionary
 *   Value, which drops a list.
 */

import { randomUUID } from 'node:crypto';

/** The queue file, in the Shortcuts folder of iCloud Drive. */
export const QUEUE_FILE = 'personalos-queue.json';

/** The names the Shortcuts are installed under, and the files they are written to. */
export const SHORTCUT_NAMES = Object.freeze(['Capture', 'Journal', 'Send queued']);

/**
 * A property list value. Nested values are `any`: a recursive alias is not
 * expressible in a JSDoc typedef, and toXmlPlist checks every leaf it writes.
 *
 * @typedef {string | number | boolean | any[] | { [key: string]: any }} PlistValue
 * @typedef {{ [key: string]: any }} PlistDict
 */

const OBJECT_REPLACEMENT = '￼';
const IS = 4;
const HAS_ANY_VALUE = 100;
const HAS_NO_VALUE = 101;

/** @returns {string} */
function uid() {
  return randomUUID().toUpperCase();
}

// --- references ----------------------------------------------------------------

/**
 * A named variable, or one key of the dictionary it holds.
 *
 * @param {string} name
 * @param {string} [key]
 * @returns {PlistDict}
 */
function variable(name, key) {
  /** @type {PlistDict} */
  const ref = { Type: 'Variable', VariableName: name };
  if (key) ref.Aggrandizements = [{ Type: 'WFDictionaryValueVariableAggrandizement', DictionaryKey: key }];
  return ref;
}

/** @param {PlistDict} ref */
function attach(ref) {
  return { Value: ref, WFSerializationType: 'WFTextTokenAttachment' };
}

/**
 * A text made of plain strings and references.
 *
 * @param {...(string | PlistDict)} parts
 * @returns {PlistValue}
 */
function text(...parts) {
  let string = '';
  /** @type {PlistDict} */
  const ranges = {};
  for (const part of parts) {
    if (typeof part === 'string') {
      string += part;
    } else {
      ranges['{' + string.length + ', 1}'] = part;
      string += OBJECT_REPLACEMENT;
    }
  }
  if (Object.keys(ranges).length === 0) return string;
  return { Value: { string, attachmentsByRange: ranges }, WFSerializationType: 'WFTextTokenString' };
}

/**
 * A text token even when it holds no reference, as a field and a file path take.
 *
 * @param {PlistValue} value
 * @returns {PlistValue}
 */
function token(value) {
  return typeof value === 'string'
    ? { Value: { string: value, attachmentsByRange: {} }, WFSerializationType: 'WFTextTokenString' }
    : value;
}

/**
 * A dictionary field set: each value a text, or `[]` for an empty array.
 *
 * @param {Array<[string, PlistValue]>} pairs
 * @returns {PlistDict}
 */
function fields(pairs) {
  return {
    Value: {
      WFDictionaryFieldValueItems: pairs.map(([key, value]) => ({ WFItemType: 0, WFKey: token(key), WFValue: token(value) })),
    },
    WFSerializationType: 'WFDictionaryFieldValue',
  };
}

// --- actions -------------------------------------------------------------------

class Builder {
  constructor() {
    /** @type {PlistDict[]} */
    this.actions = [];
  }

  /**
   * @param {string} id the action, without `is.workflow.actions.`
   * @param {PlistDict} [params]
   */
  add(id, params = {}) {
    this.actions.push({ WFWorkflowActionIdentifier: 'is.workflow.actions.' + id, WFWorkflowActionParameters: params });
  }

  /**
   * An action whose output a later one uses.
   *
   * @param {string} id
   * @param {string} outputName
   * @param {PlistDict} params
   * @returns {PlistDict} a reference to its output
   */
  emit(id, outputName, params) {
    const UUID = uid();
    this.add(id, { UUID, ...params });
    return { Type: 'ActionOutput', OutputUUID: UUID, OutputName: outputName };
  }

  /** @param {...(string | PlistDict)} parts */
  text(...parts) {
    return this.emit('gettext', 'Text', { WFTextActionText: text(...parts) });
  }

  /** @param {string} name @param {PlistDict} ref */
  set(name, ref) {
    this.add('setvariable', { WFVariableName: name, WFInput: attach(ref) });
  }

  /** @param {string} name @param {PlistDict} ref */
  append(name, ref) {
    this.add('appendvariable', { WFVariableName: name, WFInput: attach(ref) });
  }

  /** @param {PlistDict} ref @param {string} key */
  valueForKey(ref, key) {
    return this.emit('getvalueforkey', 'Dictionary Value', {
      WFInput: attach(ref),
      WFDictionaryKey: key,
      WFGetDictionaryValueType: 'Value',
    });
  }

  /** @param {...(string | PlistDict)} parts */
  notify(...parts) {
    this.add('notification', { WFNotificationActionTitle: 'PersonalOS', WFNotificationActionBody: text(...parts) });
  }

  /**
   * @param {PlistDict} ref
   * @param {number} condition
   * @param {string} [operand]
   * @returns {string} the group, for `otherwise` and `endIf`
   */
  if(ref, condition, operand) {
    const group = uid();
    /** @type {PlistDict} */
    const params = {
      GroupingIdentifier: group,
      WFControlFlowMode: 0,
      WFCondition: condition,
      WFInput: { Type: 'Variable', Variable: attach(ref) },
    };
    if (operand !== undefined) params.WFConditionalActionString = operand;
    this.add('conditional', params);
    return group;
  }

  /** @param {string} group */
  otherwise(group) {
    this.add('conditional', { GroupingIdentifier: group, WFControlFlowMode: 1 });
  }

  /** @param {string} group */
  endIf(group) {
    this.add('conditional', { UUID: uid(), GroupingIdentifier: group, WFControlFlowMode: 2 });
  }
}

/**
 * Actions 0 to 3: the host and the token, each an import question.
 *
 * @param {Builder} b
 * @param {string} host
 * @returns {PlistDict[]}
 */
function settings(b, host) {
  b.set('host', b.text(host));
  b.set('token', b.text(''));
  return [
    { ActionIndex: 0, Category: 'Parameter', DefaultValue: host, ParameterKey: 'WFTextActionText', Text: 'The Mac on the tailnet' },
    {
      ActionIndex: 2,
      Category: 'Parameter',
      DefaultValue: '',
      ParameterKey: 'WFTextActionText',
      Text: 'PERSONALOS_PHONE_TOKEN from .env.local',
    },
  ];
}

/** @param {Builder} b */
function readQueue(b) {
  const file = b.emit('documentpicker.open', 'File', {
    WFGetFilePath: token(QUEUE_FILE),
    WFFileErrorIfNotFound: false,
    WFShowFilePicker: false,
  });
  const queue = b.emit('detect.dictionary', 'Dictionary', { WFInput: attach(file) });
  b.set('waiting', b.valueForKey(queue, 'items'));
}

/**
 * Saves the list in `name` as `{"items":[...]}`, as JSON text.
 *
 * @param {Builder} b
 * @param {string} name
 */
function saveQueue(b, name) {
  /** @param {PlistDict} ref */
  const save = (ref) =>
    b.add('documentpicker.save', {
      WFInput: attach(ref),
      WFAskWhereToSave: false,
      WFFileDestinationPath: token(QUEUE_FILE),
      WFSaveFileOverwrite: true,
    });

  const any = b.if(variable(name), HAS_ANY_VALUE);
  const joined = b.emit('text.combine', 'Combined Text', {
    WFTextSeparator: 'Custom',
    WFTextCustomSeparator: ',',
    text: attach(variable(name)),
  });
  save(b.text('{"items":[', joined, ']}'));
  b.otherwise(any);
  save(b.text('{"items":[]}'));
  b.endIf(any);
}

/**
 * Posts the repeat item and keeps the reply in `reply`.
 *
 * @param {Builder} b
 * @param {'/api/capture' | '/api/journal'} path
 */
function post(b, path) {
  /** @type {Array<[string, PlistValue]>} */
  const body = ['text', 'saidAt', 'clientId'].map((key) => [key, text(variable('Repeat Item', key))]);
  if (path === '/api/capture') body.push(['origin', 'shortcut']);
  const reply = b.emit('downloadurl', 'Contents of URL', {
    WFURL: text(variable('host'), path),
    WFHTTPMethod: 'POST',
    ShowHeaders: true,
    WFHTTPHeaders: fields([
      ['Authorization', text('Bearer ', variable('token'))],
      ['Content-Type', 'application/json'],
    ]),
    WFHTTPBodyType: 'JSON',
    WFJSONValues: fields(body),
  });
  b.set('reply', reply);
}

/**
 * Sends `waiting` oldest first and stops at the first item not filed: that
 * one and every later one are saved back, in order. Then the notification.
 *
 * @param {Builder} b
 */
function flush(b) {
  b.set('stop', b.text('no'));
  b.set('reason', b.text('Mac unreachable'));

  const repeat = uid();
  b.add('repeat.each', { GroupingIdentifier: repeat, WFControlFlowMode: 0, WFInput: attach(variable('waiting')) });

  const stopped = b.if(variable('stop'), IS, 'yes');
  b.append('left', variable('Repeat Item'));
  b.otherwise(stopped);

  const kind = b.text(b.valueForKey(variable('Repeat Item'), 'kind'));
  const journal = b.if(kind, IS, 'journal');
  post(b, '/api/journal');
  b.otherwise(journal);
  post(b, '/api/capture');
  b.endIf(journal);

  // Filed if and only if the reply has a receiptLine (docs/shortcuts.md).
  const receipt = b.valueForKey(variable('reply'), 'receiptLine');
  const filed = b.if(receipt, HAS_ANY_VALUE);
  b.set('last', receipt);
  b.otherwise(filed);
  b.append('left', variable('Repeat Item'));
  b.set('stop', b.text('yes'));
  const error = b.valueForKey(variable('reply'), 'error');
  const refused = b.if(error, HAS_ANY_VALUE);
  b.set('reason', error);
  b.endIf(refused);
  b.endIf(filed);

  b.endIf(stopped);
  b.add('repeat.each', { UUID: uid(), GroupingIdentifier: repeat, WFControlFlowMode: 2 });

  saveQueue(b, 'left');

  const queued = b.if(variable('left'), HAS_ANY_VALUE);
  const count = b.emit('count', 'Count', { WFCountType: 'Items', WFInput: attach(variable('left')) });
  b.notify('Queued · ', variable('reason'), ' · ', count, ' waiting');
  b.otherwise(queued);
  const sent = b.if(variable('last'), HAS_ANY_VALUE);
  b.notify(variable('last'));
  b.otherwise(sent);
  b.notify('Nothing waiting');
  b.endIf(sent);
  b.endIf(queued);
}

/**
 * Dictates, then adds the sentence to the queue and saves it before anything
 * touches the network: it cannot be lost.
 *
 * @param {Builder} b
 * @param {{ kind: 'capture' | 'journal', stopListening: string, prefix: string }} o
 */
function dictate(b, { kind, stopListening, prefix }) {
  b.set('said', b.emit('dictatetext', 'Dictated Text', { WFDictateTextStopListening: stopListening }));
  const silent = b.if(variable('said'), HAS_NO_VALUE);
  b.add('exit');
  b.endIf(silent);

  b.set(
    'saidAt',
    b.emit('format.date', 'Formatted Date', {
      WFDateFormatStyle: 'ISO 8601',
      WFISO8601IncludeTime: true,
      WFDate: text({ Type: 'CurrentDate' }),
    })
  );
  const random = b.emit('number.random', 'Random Number', { WFRandomNumberMinimum: 1000, WFRandomNumberMaximum: 9999 });
  b.set('clientId', b.text(prefix, variable('saidAt'), '-', random));
  const item = b.emit('dictionary', 'Dictionary', {
    WFItems: fields([
      ['kind', kind],
      ['text', text(variable('said'))],
      ['saidAt', text(variable('saidAt'))],
      ['clientId', text(variable('clientId'))],
    ]),
  });

  readQueue(b);
  b.append('waiting', item);
  saveQueue(b, 'waiting');
}

/** @type {Record<string, { build: (b: Builder) => void, color: number, glyph: number }>} */
const RECIPES = {
  Capture: {
    build: (b) => {
      dictate(b, { kind: 'capture', stopListening: 'After Pause', prefix: 'phone-' });
      flush(b);
    },
    color: 4271458815,
    glyph: 59780,
  },
  Journal: {
    build: (b) => {
      // An entry is several sentences: it ends on a tap, not on a pause.
      dictate(b, { kind: 'journal', stopListening: 'On Tap', prefix: 'phone-journal-' });
      flush(b);
    },
    color: 2846468607,
    glyph: 59448,
  },
  'Send queued': {
    build: (b) => {
      readQueue(b);
      flush(b);
    },
    color: 4282601983,
    glyph: 59511,
  },
};

/**
 * One Shortcut, unsigned, as the property list `shortcuts sign` takes.
 *
 * @param {string} name one of SHORTCUT_NAMES
 * @param {{ host: string }} o `host` is the Mac's tailnet URL, the default
 *   answer to the import question; it is not otherwise written in
 * @returns {PlistDict}
 */
export function buildShortcut(name, { host }) {
  const recipe = RECIPES[name];
  if (!recipe) throw new Error('unknown Shortcut: ' + name);
  if (!/^https:\/\/[^/\s]+$/.test(host)) throw new Error('host must be https://<name> with no path: ' + host);

  const b = new Builder();
  const questions = settings(b, host);
  recipe.build(b);
  return {
    WFWorkflowActions: b.actions,
    WFWorkflowClientVersion: '2605.0.5',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: { WFWorkflowIconStartColor: recipe.color, WFWorkflowIconGlyphNumber: recipe.glyph },
    WFWorkflowImportQuestions: questions,
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowTypes: [],
    WFQuickActionSurfaces: [],
    WFWorkflowHasShortcutInputVariables: false,
    WFWorkflowHasOutputFallback: false,
  };
}

/** @param {string} s */
function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {PlistValue} value
 * @param {string} indent
 * @returns {string}
 */
function plistValue(value, indent) {
  if (typeof value === 'string') return indent + '<string>' + escapeXml(value) + '</string>';
  if (typeof value === 'boolean') return indent + (value ? '<true/>' : '<false/>');
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('only integers are written: ' + value);
    return indent + '<integer>' + value + '</integer>';
  }
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (value.length === 0) return indent + '<array/>';
    return [indent + '<array>', ...value.map((item) => plistValue(item, inner)), indent + '</array>'].join('\n');
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return indent + '<dict/>';
  return [
    indent + '<dict>',
    ...keys.flatMap((key) => [inner + '<key>' + escapeXml(key) + '</key>', plistValue(value[key], inner)]),
    indent + '</dict>',
  ].join('\n');
}

/**
 * An XML property list. `shortcuts sign` takes only the binary form, so the
 * script converts it with `plutil` first.
 *
 * @param {PlistValue} value
 * @returns {string}
 */
export function toXmlPlist(value) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    plistValue(value, ''),
    '</plist>',
    '',
  ].join('\n');
}
