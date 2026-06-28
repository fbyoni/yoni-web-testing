function AudioKeys(options) {
  var self = this;

  self._setState(options);

  // all listeners are stored in arrays in their respective properties.
  // e.g. self._listeners.down = [fn1, fn2, ... ]
  self._listeners = {};

  // bind DOM events
  self._bind();
}

// Play well with require so that we can run a test suite and use browserify.
if (typeof module !== 'undefined') {
  module.exports = AudioKeys;
}

AudioKeys.prototype._setState = function(options) {
  var self = this;

  if (!options) {
    options = {};
  }

  // the state is kept in this object
  self._state = {};

  // set some defaults ...
  self._extendState({
    polyphony: 4,
    rows: 1,
    priority: 'last',
    rootNote: 60,
    octaveControls: true,
    octave: 0,
    velocityControls: true,
    velocity: 127,
    keys: [],
    buffer: []
  });

  // ... and override them with options.
  self._extendState(options);
};

AudioKeys.prototype._extendState = function(options) {
  var self = this;

  for (var o in options) {
    self._state[o] = options[o];
  }
};

AudioKeys.prototype.set = function(/* options || property, value */) {
  var self = this;

  if (arguments.length === 1) {
    self._extendState(arguments[0]);
  } else {
    self._state[arguments[0]] = arguments[1];
  }

  return this;
};

AudioKeys.prototype.get = function(property) {
  var self = this;

  return self._state[property];
};

// ================================================================
// Event Listeners
// ================================================================

// AudioKeys has a very simple event handling system. Internally
// we'll call self._trigger('down', argument) when we want to fire
// an event for the user.

AudioKeys.prototype.down = function(fn) {
  var self = this;

  // add the function to our list of listeners
  self._listeners.down = (self._listeners.down || []).concat(fn);
};

AudioKeys.prototype.up = function(fn) {
  var self = this;

  // add the function to our list of listeners
  self._listeners.up = (self._listeners.up || []).concat(fn);
};

AudioKeys.prototype._trigger = function(action /* args */) {
  var self = this;

  // if we have any listeners by this name ...
  if (self._listeners[action] && self._listeners[action].length) {
    // grab the arguments to pass to the listeners ...
    var args = Array.prototype.slice.call(arguments);
    args.splice(0, 1);
    // and call them!
    self._listeners[action].forEach(function(fn) {
      fn.apply(self, args);
    });
  }
};

// ================================================================
// DOM Bindings
// ================================================================

AudioKeys.prototype._bind = function() {
  var self = this;

  if (typeof window !== 'undefined' && window.document) {
    window.document.addEventListener('keydown', function(e) {
      self._addKey(e);
    });
    window.document.addEventListener('keyup', function(e) {
      self._removeKey(e);
    });

    var lastFocus = true;
    setInterval(function() {
      if (window.document.hasFocus() === lastFocus) {
        return;
      }
      lastFocus = !lastFocus;
      if (!lastFocus) {
        self.clear();
      }
    }, 100);
  }
};

// _map returns the midi note for a given keyCode.
AudioKeys.prototype._map = function(keyCode) {
  return this._keyMap[this._state.rows][keyCode] + this._offset();
};

AudioKeys.prototype._offset = function() {
  return (
    this._state.rootNote -
    this._keyMap[this._state.rows].root +
    this._state.octave * 12
  );
};

// _isNote determines whether a keyCode is a note or not.
AudioKeys.prototype._isNote = function(keyCode) {
  return !!this._keyMap[this._state.rows][keyCode];
};

// convert a midi note to a frequency. we assume here that _map has
// already been called (to account for a potential rootNote offset)
AudioKeys.prototype._toFrequency = function(note) {
  return Math.pow(2, (note - 69) / 12) * 440.0;
};

// the object keys correspond to `rows`, so `_keyMap[rows]` should
// retrieve that particular mapping.
AudioKeys.prototype._keyMap = {
  1: {
    root: 60,
    // starting with the 'a' key
    65: 60,
    87: 61,
    83: 62,
    69: 63,
    68: 64,
    70: 65,
    84: 66,
    71: 67,
    89: 68,
    72: 69,
    85: 70,
    74: 71,
    75: 72,
    79: 73,
    76: 74,
    80: 75,
    186: 76,
    222: 77
  },
  2: {
    root: 60,
    // bottom row
    90: 60,
    83: 61,
    88: 62,
    68: 63,
    67: 64,
    86: 65,
    71: 66,
    66: 67,
    72: 68,
    78: 69,
    74: 70,
    77: 71,
    188: 72,
    76: 73,
    190: 74,
    186: 75,
    191: 76,
    // top row
    81: 72,
    50: 73,
    87: 74,
    51: 75,
    69: 76,
    82: 77,
    53: 78,
    84: 79,
    54: 80,
    89: 81,
    55: 82,
    85: 83,
    73: 84,
    57: 85,
    79: 86,
    48: 87,
    80: 88,
    219: 89,
    187: 90,
    221: 91
  }
};

// ================================================================
// KEY BUFFER
// ================================================================

// The process is:

// key press
//   add to self._state.keys
//   (an accurate representation of keys currently pressed)
// resolve self.buffer
//   based on polyphony and priority, determine the notes
//   that get triggered for the user

AudioKeys.prototype._addKey = function(e) {
  var self = this;
  // if the keyCode is one that can be mapped and isn't
  // already pressed, add it to the key object.
  if (self._isNote(e.keyCode) && !self._isPressed(e.keyCode)) {
    var newKey = self._makeNote(e.keyCode);
    // add the newKey to the list of keys
    self._state.keys = (self._state.keys || []).concat(newKey);
    // reevaluate the active notes based on our priority rules.
    // give it the new note to use if there is an event to trigger.
    self._update();
  } else if (self._isSpecialKey(e.keyCode)) {
    self._specialKey(e.keyCode);
  }
};

AudioKeys.prototype._removeKey = function(e) {
  var self = this;
  // if the keyCode is active, remove it from the key object.
  if (self._isPressed(e.keyCode)) {
    var keyToRemove;
    for (var i = 0; i < self._state.keys.length; i++) {
      if (self._state.keys[i].keyCode === e.keyCode) {
        keyToRemove = self._state.keys[i];
        break;
      }
    }

    // remove the key from _keys
    self._state.keys.splice(self._state.keys.indexOf(keyToRemove), 1);
    self._update();
  }
};

AudioKeys.prototype._isPressed = function(keyCode) {
  var self = this;

  if (!self._state.keys || !self._state.keys.length) {
    return false;
  }

  for (var i = 0; i < self._state.keys.length; i++) {
    if (self._state.keys[i].keyCode === keyCode) {
      return true;
    }
  }
  return false;
};

// turn a key object into a note object for the event listeners.
AudioKeys.prototype._makeNote = function(keyCode) {
  var self = this;
  return {
    keyCode: keyCode,
    note: self._map(keyCode),
    frequency: self._toFrequency(self._map(keyCode)),
    velocity: self._state.velocity
  };
};

// clear any active notes
AudioKeys.prototype.clear = function() {
  var self = this;
  // trigger note off for the notes in the buffer before
  // removing them.
  self._state.buffer.forEach(function(key) {
    self._trigger('up', key);
  });
  self._state.keys = [];
  self._state.buffer = [];
};

// ================================================================
// NOTE BUFFER
// ================================================================

// every time a change is made to _keys due to a key on or key off
// we need to call `_update`. It compares the `_keys` array to the
// `buffer` array, which is the array of notes that are really
// being played, makes the necessary changes to `buffer` and
// triggers any events that need triggering.

AudioKeys.prototype._update = function() {
  var self = this;

  // a key has been added to self._state.keys.
  // stash the old buffer
  var oldBuffer = self._state.buffer;
  // set the new priority in self.state._keys
  self._prioritize();
  // compare the buffers and trigger events based on
  // the differences.
  self._diff(oldBuffer);
};

AudioKeys.prototype._diff = function(oldBuffer) {
  var self = this;

  // if it's not in the OLD buffer, it's a note ON.
  // if it's not in the NEW buffer, it's a note OFF.

  var oldNotes = oldBuffer.map(function(key) {
    return key.keyCode;
  });

  var newNotes = self._state.buffer.map(function(key) {
    return key.keyCode;
  });

  // check for old (removed) notes
  var notesToRemove = [];
  oldNotes.forEach(function(key) {
    if (newNotes.indexOf(key) === -1) {
      notesToRemove.push(key);
    }
  });

  // check for new notes
  var notesToAdd = [];
  newNotes.forEach(function(key) {
    if (oldNotes.indexOf(key) === -1) {
      notesToAdd.push(key);
    }
  });

  notesToAdd.forEach(function(key) {
    for (var i = 0; i < self._state.buffer.length; i++) {
      if (self._state.buffer[i].keyCode === key) {
        self._trigger('down', self._state.buffer[i]);
        break;
      }
    }
  });

  notesToRemove.forEach(function(key) {
    // these need to fire the entire object
    for (var i = 0; i < oldBuffer.length; i++) {
      if (oldBuffer[i].keyCode === key) {
        self._trigger('up', oldBuffer[i]);
        break;
      }
    }
  });
};

AudioKeys.prototype._prioritize = function() {
  var self = this;

  // if all the keys have been turned off, no need
  // to do anything here.
  if (!self._state.keys.length) {
    self._state.buffer = [];
    return;
  }

  if (self._state.polyphony >= self._state.keys.length) {
    // every note is active
    self._state.keys = self._state.keys.map(function(key) {
      key.isActive = true;
      return key;
    });
  } else {
    // set all keys to inactive.
    self._state.keys = self._state.keys.map(function(key) {
      key.isActive = false;
      return key;
    });

    self['_' + self._state.priority]();
  }

  // now take the isActive keys and set the new buffer.
  self._state.buffer = [];

  self._state.keys.forEach(function(key) {
    if (key.isActive) {
      self._state.buffer.push(key);
    }
  });

  // done.
};

AudioKeys.prototype._last = function() {
  var self = this;
  // set the last bunch to active based on the polyphony.
  for (
    var i = self._state.keys.length - self._state.polyphony;
    i < self._state.keys.length;
    i++
  ) {
    self._state.keys[i].isActive = true;
  }
};

AudioKeys.prototype._first = function() {
  var self = this;
  // set the last bunch to active based on the polyphony.
  for (var i = 0; i < self._state.polyphony; i++) {
    self._state.keys[i].isActive = true;
  }
};

AudioKeys.prototype._highest = function() {
  var self = this;
  // get the highest notes and set them to active
  var notes = self._state.keys.map(function(key) {
    return key.note;
  });

  notes.sort(function(b, a) {
    if (a === b) {
      return 0;
    }
    return a < b ? -1 : 1;
  });

  notes.splice(self._state.polyphony, Number.MAX_VALUE);

  self._state.keys.forEach(function(key) {
    if (notes.indexOf(key.note) !== -1) {
      key.isActive = true;
    }
  });
};

AudioKeys.prototype._lowest = function() {
  var self = this;
  // get the lowest notes and set them to active
  var notes = self._state.keys.map(function(key) {
    return key.note;
  });

  notes.sort(function(a, b) {
    if (a === b) {
      return 0;
    }
    return a < b ? -1 : 1;
  });

  notes.splice(self._state.polyphony, Number.MAX_VALUE);

  self._state.keys.forEach(function(key) {
    if (notes.indexOf(key.note) !== -1) {
      key.isActive = true;
    }
  });
};

// This file maps special keys to the state— octave shifting and
// velocity selection, both available when `rows` = 1.

AudioKeys.prototype._isSpecialKey = function(keyCode) {
  return this._state.rows === 1 && this._specialKeyMap[keyCode];
};

AudioKeys.prototype._specialKey = function(keyCode) {
  var self = this;
  if (
    self._specialKeyMap[keyCode].type === 'octave' &&
    self._state.octaveControls
  ) {
    // shift the state of the `octave`
    self._state.octave += self._specialKeyMap[keyCode].value;
  } else if (
    self._specialKeyMap[keyCode].type === 'velocity' &&
    self._state.velocityControls
  ) {
    // set the `velocity` to a new value
    self._state.velocity = self._specialKeyMap[keyCode].value;
  }
};

AudioKeys.prototype._specialKeyMap = {
  // octaves
  90: {
    type: 'octave',
    value: -1
  },
  88: {
    type: 'octave',
    value: 1
  },
  // velocity
  49: {
    type: 'velocity',
    value: 1
  },
  50: {
    type: 'velocity',
    value: 14
  },
  51: {
    type: 'velocity',
    value: 28
  },
  52: {
    type: 'velocity',
    value: 42
  },
  53: {
    type: 'velocity',
    value: 56
  },
  54: {
    type: 'velocity',
    value: 70
  },
  55: {
    type: 'velocity',
    value: 84
  },
  56: {
    type: 'velocity',
    value: 98
  },
  57: {
    type: 'velocity',
    value: 112
  },
  48: {
    type: 'velocity',
    value: 127
  }
};
