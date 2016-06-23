var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _nuclideTextedit2;

function _nuclideTextedit() {
  return _nuclideTextedit2 = require('../../nuclide-textedit');
}

var _commonsNodeCollection2;

function _commonsNodeCollection() {
  return _commonsNodeCollection2 = require('../../commons-node/collection');
}

var _MarkerTracker2;

function _MarkerTracker() {
  return _MarkerTracker2 = require('./MarkerTracker');
}

var _assert2;

function _assert() {
  return _assert2 = _interopRequireDefault(require('assert'));
}

var _atom2;

function _atom() {
  return _atom2 = require('atom');
}

var PROJECT_MESSAGE_CHANGE_EVENT = 'messages-changed-for-project';
var ALL_CHANGE_EVENT = 'messages-changed';

var DiagnosticStore = (function () {
  function DiagnosticStore() {
    _classCallCheck(this, DiagnosticStore);

    this._providerToFileToMessages = new Map();
    this._fileToProviders = new Map();
    this._providerToProjectDiagnostics = new Map();

    this._fileChangeEmitter = new (_atom2 || _atom()).Emitter();
    this._nonFileChangeEmitter = new (_atom2 || _atom()).Emitter();
    this._fileToListenersCount = new Map();
    this._projectListenersCount = 0;
    this._allMessagesListenersCount = 0;

    this._markerTracker = new (_MarkerTracker2 || _MarkerTracker()).MarkerTracker();
  }

  _createClass(DiagnosticStore, [{
    key: 'dispose',
    value: function dispose() {
      this._providerToFileToMessages.clear();
      this._fileToProviders.clear();
      this._providerToProjectDiagnostics.clear();
      this._fileChangeEmitter.dispose();
      this._nonFileChangeEmitter.dispose();
      this._fileToListenersCount.clear();
      this._markerTracker.dispose();
    }

    /**
     * Section: Methods to modify the store.
     */

    /**
     * Update the messages from the given provider.
     * If the update contains messages at a scope that already has messages from
     * this provider in the store, the existing messages will be overwritten by the
     * new messages.
     * @param diagnosticProvider The diagnostic provider that these messages come from.
     * @param updates Set of updates to apply.
     */
  }, {
    key: 'updateMessages',
    value: function updateMessages(diagnosticProvider, updates) {
      if (updates.filePathToMessages) {
        this._updateFileMessages(diagnosticProvider, updates.filePathToMessages);
      }
      if (updates.projectMessages) {
        this._updateProjectMessages(diagnosticProvider, updates.projectMessages);
      }
      if (updates.filePathToMessages || updates.projectMessages) {
        this._emitAllMessages();
      }
    }
  }, {
    key: '_updateFileMessages',
    value: function _updateFileMessages(diagnosticProvider, newFilePathsToMessages) {
      var _this = this;

      var fileToMessages = this._providerToFileToMessages.get(diagnosticProvider);
      if (!fileToMessages) {
        fileToMessages = new Map();
        this._providerToFileToMessages.set(diagnosticProvider, fileToMessages);
      }
      newFilePathsToMessages.forEach(function (newMessagesForPath, filePath) {
        // Flow naively thinks that since we are in a closure, fileToMessages could have been
        // reassigned to something null by the time this executes.
        (0, (_assert2 || _assert()).default)(fileToMessages != null);

        var messagesToRemove = fileToMessages.get(filePath);
        if (messagesToRemove != null) {
          _this._markerTracker.removeFileMessages(messagesToRemove);
        }
        _this._markerTracker.addFileMessages(newMessagesForPath);

        // Update _providerToFileToMessages.
        fileToMessages.set(filePath, newMessagesForPath);
        // Update _fileToProviders.
        var providers = _this._fileToProviders.get(filePath);
        if (!providers) {
          providers = new Set();
          _this._fileToProviders.set(filePath, providers);
        }
        providers.add(diagnosticProvider);

        _this._emitFileMessages(filePath);
      });
    }
  }, {
    key: '_updateProjectMessages',
    value: function _updateProjectMessages(diagnosticProvider, projectMessages) {
      this._providerToProjectDiagnostics.set(diagnosticProvider, projectMessages);
      this._emitProjectMessages();
    }

    /**
     * Clear the messages from the given provider, according to the options.
     * @param options An Object of the form:
     *   * scope: Can be 'file', 'project', or 'all'.
     *       * 'file': The 'filePaths' option determines which files' messages to clear
     *       * 'project': all 'project' scope messages are cleared.
     *       * 'all': all messages are cleared.
     *   * filePaths: Array of absolute file paths (NuclideUri) to clear messages for.
     */
  }, {
    key: 'invalidateMessages',
    value: function invalidateMessages(diagnosticProvider, invalidationMessage) {
      if (invalidationMessage.scope === 'file') {
        this._invalidateFileMessagesForProvider(diagnosticProvider, invalidationMessage.filePaths);
        this._emitAllMessages();
      } else if (invalidationMessage.scope === 'project') {
        this._invalidateProjectMessagesForProvider(diagnosticProvider);
        this._emitAllMessages();
      } else if (invalidationMessage.scope === 'all') {
        this._invalidateAllMessagesForProvider(diagnosticProvider);
      }
    }
  }, {
    key: '_invalidateFileMessagesForProvider',
    value: function _invalidateFileMessagesForProvider(diagnosticProvider, pathsToRemove) {
      var fileToDiagnostics = this._providerToFileToMessages.get(diagnosticProvider);
      for (var filePath of pathsToRemove) {
        // Update _providerToFileToMessages.
        if (fileToDiagnostics) {
          var diagnosticsToRemove = fileToDiagnostics.get(filePath);
          if (diagnosticsToRemove != null) {
            this._markerTracker.removeFileMessages(diagnosticsToRemove);
          }
          fileToDiagnostics.delete(filePath);
        }
        // Update _fileToProviders.
        var providers = this._fileToProviders.get(filePath);
        if (providers) {
          providers.delete(diagnosticProvider);
        }
        this._emitFileMessages(filePath);
      }
    }
  }, {
    key: '_invalidateProjectMessagesForProvider',
    value: function _invalidateProjectMessagesForProvider(diagnosticProvider) {
      this._providerToProjectDiagnostics.delete(diagnosticProvider);
      this._emitProjectMessages();
    }
  }, {
    key: '_invalidateAllMessagesForProvider',
    value: function _invalidateAllMessagesForProvider(diagnosticProvider) {
      // Invalidate all file messages.
      var filesToDiagnostics = this._providerToFileToMessages.get(diagnosticProvider);
      if (filesToDiagnostics) {
        var allFilePaths = filesToDiagnostics.keys();
        this._invalidateFileMessagesForProvider(diagnosticProvider, allFilePaths);
      }
      // Invalidate all project messages.
      this._invalidateProjectMessagesForProvider(diagnosticProvider);

      this._emitAllMessages();
    }
  }, {
    key: '_invalidateSingleMessage',
    value: function _invalidateSingleMessage(message) {
      this._markerTracker.removeFileMessages([message]);
      for (var fileToMessages of this._providerToFileToMessages.values()) {
        var fileMessages = fileToMessages.get(message.filePath);
        if (fileMessages != null) {
          (0, (_commonsNodeCollection2 || _commonsNodeCollection()).arrayRemove)(fileMessages, message);
        }
      }
      // Looks like emitAllMessages does not actually emit all messages. We need to do both for both
      // the gutter UI and the diagnostics table to get updated.
      this._emitFileMessages(message.filePath);
      this._emitAllMessages();
    }

    /**
     * Section: Methods to read from the store.
     */

    /**
     * Call the callback when the filePath's messages have changed.
     * In addition, the Store will immediately invoke the callback with the data
     * currently in the Store, iff there is any.
     * @param callback The function to message when any of the filePaths' messages
     *   change. The array of messages is meant to completely replace any previous
     *   messages for this file path.
     */
  }, {
    key: 'onFileMessagesDidUpdate',
    value: function onFileMessagesDidUpdate(callback, filePath) {
      var _this2 = this;

      // Use the filePath as the event name.
      var emitterDisposable = this._fileChangeEmitter.on(filePath, callback);
      this._incrementFileListenerCount(filePath);

      var fileMessages = this._getFileMessages(filePath);
      if (fileMessages.length) {
        callback({ filePath: filePath, messages: fileMessages });
      }
      return new (_atom2 || _atom()).Disposable(function () {
        emitterDisposable.dispose();
        _this2._decrementFileListenerCount(filePath);
      });
    }
  }, {
    key: '_incrementFileListenerCount',
    value: function _incrementFileListenerCount(filePath) {
      var currentCount = this._fileToListenersCount.get(filePath) || 0;
      this._fileToListenersCount.set(filePath, currentCount + 1);
    }
  }, {
    key: '_decrementFileListenerCount',
    value: function _decrementFileListenerCount(filePath) {
      var currentCount = this._fileToListenersCount.get(filePath) || 0;
      if (currentCount > 0) {
        this._fileToListenersCount.set(filePath, currentCount - 1);
      }
    }

    /**
     * Call the callback when project-scope messages change.
     * In addition, the Store will immediately invoke the callback with the data
     * currently in the Store, iff there is any.
     * @param callback The function to message when the project-scope messages
     *   change. The array of messages is meant to completely replace any previous
     *   project-scope messages.
     */
  }, {
    key: 'onProjectMessagesDidUpdate',
    value: function onProjectMessagesDidUpdate(callback) {
      var _this3 = this;

      var emitterDisposable = this._nonFileChangeEmitter.on(PROJECT_MESSAGE_CHANGE_EVENT, callback);
      this._projectListenersCount += 1;

      var projectMessages = this._getProjectMessages();
      if (projectMessages.length) {
        callback(projectMessages);
      }
      return new (_atom2 || _atom()).Disposable(function () {
        emitterDisposable.dispose();
        _this3._projectListenersCount -= 1;
      });
    }

    /**
     * Call the callback when any messages change.
     * In addition, the Store will immediately invoke the callback with data
     * currently in the Store, iff there is any.
     * @param callback The function to message when any messages change. The array
     *   of messages is meant to completely replace any previous messages.
     */
  }, {
    key: 'onAllMessagesDidUpdate',
    value: function onAllMessagesDidUpdate(callback) {
      var _this4 = this;

      var emitterDisposable = this._nonFileChangeEmitter.on(ALL_CHANGE_EVENT, callback);
      this._allMessagesListenersCount += 1;

      var allMessages = this._getAllMessages();
      if (allMessages.length) {
        callback(allMessages);
      }
      return new (_atom2 || _atom()).Disposable(function () {
        emitterDisposable.dispose();
        _this4._allMessagesListenersCount -= 1;
      });
    }

    /**
     * Gets the current diagnostic messages for the file.
     * Prefer to get updates via ::onFileMessagesDidUpdate.
     */
  }, {
    key: '_getFileMessages',
    value: function _getFileMessages(filePath) {
      var allFileMessages = [];
      var relevantProviders = this._fileToProviders.get(filePath);
      if (relevantProviders) {
        for (var provider of relevantProviders) {
          var fileToMessages = this._providerToFileToMessages.get(provider);
          (0, (_assert2 || _assert()).default)(fileToMessages != null);
          var _messages = fileToMessages.get(filePath);
          (0, (_assert2 || _assert()).default)(_messages != null);
          allFileMessages = allFileMessages.concat(_messages);
        }
      }
      return allFileMessages;
    }

    /**
     * Gets the current project-scope diagnostic messages.
     * Prefer to get updates via ::onProjectMessagesDidUpdate.
     */
  }, {
    key: '_getProjectMessages',
    value: function _getProjectMessages() {
      var allProjectMessages = [];
      for (var _messages2 of this._providerToProjectDiagnostics.values()) {
        allProjectMessages = allProjectMessages.concat(_messages2);
      }
      return allProjectMessages;
    }

    /**
     * Gets all current diagnostic messages.
     * Prefer to get updates via ::onAllMessagesDidUpdate.
     */
  }, {
    key: '_getAllMessages',
    value: function _getAllMessages() {
      var allMessages = [];
      // Get all file messages.
      for (var fileToMessages of this._providerToFileToMessages.values()) {
        for (var _messages3 of fileToMessages.values()) {
          allMessages = allMessages.concat(_messages3);
        }
      }
      // Get all project messages.
      allMessages = allMessages.concat(this._getProjectMessages());
      return allMessages;
    }

    /**
     * Section: Feedback from the UI
     */

  }, {
    key: 'applyFix',
    value: function applyFix(message) {
      var succeeded = this._applySingleFix(message);
      if (!succeeded) {
        notifyFixFailed();
      }
    }
  }, {
    key: 'applyFixesForFile',
    value: function applyFixesForFile(file) {
      for (var message of this._getFileMessages(file)) {
        if (message.fix != null) {
          var succeeded = this._applySingleFix(message);
          if (!succeeded) {
            notifyFixFailed();
            return;
          }
        }
      }
    }

    /**
     * Returns true iff the fix succeeds.
     */
  }, {
    key: '_applySingleFix',
    value: function _applySingleFix(message) {
      var fix = message.fix;
      (0, (_assert2 || _assert()).default)(fix != null);

      var actualRange = this._markerTracker.getCurrentRange(message);

      if (actualRange == null) {
        return false;
      }

      var fixWithActualRange = _extends({}, fix, {
        oldRange: actualRange
      });
      var succeeded = (0, (_nuclideTextedit2 || _nuclideTextedit()).applyTextEdit)(message.filePath, fixWithActualRange);
      if (succeeded) {
        this._invalidateSingleMessage(message);
        return true;
      } else {
        return false;
      }
    }

    /**
     * Section: Event Emitting
     */

  }, {
    key: '_emitFileMessages',
    value: function _emitFileMessages(filePath) {
      if (this._fileToListenersCount.get(filePath)) {
        this._fileChangeEmitter.emit(filePath, { filePath: filePath, messages: this._getFileMessages(filePath) });
      }
    }
  }, {
    key: '_emitProjectMessages',
    value: function _emitProjectMessages() {
      if (this._projectListenersCount) {
        this._nonFileChangeEmitter.emit(PROJECT_MESSAGE_CHANGE_EVENT, this._getProjectMessages());
      }
    }
  }, {
    key: '_emitAllMessages',
    value: function _emitAllMessages() {
      if (this._allMessagesListenersCount) {
        this._nonFileChangeEmitter.emit(ALL_CHANGE_EVENT, this._getAllMessages());
      }
    }
  }]);

  return DiagnosticStore;
})();

function notifyFixFailed() {
  atom.notifications.addWarning('Failed to apply fix. Try saving to get fresh results and then try again.');
}

module.exports = DiagnosticStore;

// A map from each diagnostic provider to:
// a map from each file it has messages for to the array of messages for that file.

// A map from each file that has messages from any diagnostic provider
// to the set of diagnostic providers that have messages for it.

// A map from each diagnostic provider to the array of project messages from it.

// File paths are used as event names for the _fileChangeEmitter, so a second
// emitter is used for other events to prevent event name collisions.

// A map of NuclideUri to the number of listeners registered for changes to
// messages for that file.