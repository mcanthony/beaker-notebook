/*
 *  Copyright 2014 TWO SIGMA INVESTMENTS, LLC
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
/**
 * Module bk.sessionManager
 */
(function() {
  'use strict';
  var module = angular.module('bk.sessionManager',[
    'bk.utils',
    'bk.session',
    'bk.notebookCellModelManager',
    'bk.recentMenu',
    'bk.evaluatorManager',
    'firebase'
  ]);

  module.factory('bkSessionManager', function(
      $firebase,
      bkUtils,
      bkSession,
      bkNotebookCellModelManager,
      bkEvaluatorManager,
      bkRecentMenu) {

    var _notebookUri = (function() {
      var DEFAULT_VALUE = null;
      var _v = DEFAULT_VALUE;
      return {
        reset: function() {
          this.set(DEFAULT_VALUE);
        },
        get: function() {
          return _v;
        },
        set: function(v) {
          _v = v;
          if (!_.isEmpty(_v)) {
            bkRecentMenu.recordRecentDocument(generateRecentDocumentItem());
          }
        }
      };
    })();

    var _uriType = null;
    var _readOnly = null;
    var _format = null;
    var _sessionId = null;
    var _edited = false;
    var __evaluations = null;
    var _evaluations = null;
    var _sessionRef = null;

    var _notebookModel = (function() {
      var _v = {};
      return {
        reset: function() {
          this.set({});
        },
        get: function() {
          return _v;
        },
        set: function(v) {
          _v = v;
          bkNotebookCellModelManager.reset(_v.cells);
        },
        isEmpty: function() {
          return _.isEmpty(_v);
        },
        isLocked: function() {
          return !this.isEmpty() && !!_v.locked;
        },
        toJson: function() {
          return angular.toJson(_v);
        },
        toPrettyJson: function() {
          return bkUtils.toPrettyJson(_v);
        }
      };
    })();

    var generateBackupData = function() {
      return {
        notebookUri: _notebookUri.get(),
        uriType: _uriType,
        readOnly: _readOnly,
        format: _format,
        notebookModelJson: _notebookModel.toJson(),
        edited: _edited
      };
    };
    var generateRecentDocumentItem = function () {
      var data = {
        uri: _notebookUri.get(),
        type: _.isEmpty(_uriType) ? "" : _uriType,
        readOnly: !!_readOnly ? true : false,
        format: _.isEmpty(_format) ? "" : _format
      };
      return angular.toJson(data);
    };

    var generateSaveData = function() {
      return {
        uriType: _uriType,
        notebookUri: _notebookUri.get(),
        notebookModelAsString: _notebookModel.toPrettyJson()
      };
    };

    return {
      reset: function(notebookUri, uriType, readOnly, format, notebookModel, edited, sessionId) {

        // backup existing session if it's not empty.
        if (_sessionId && !_notebookModel.isEmpty()) {
          bkSession.backup(_sessionId, generateBackupData());
        }

        bkEvaluatorManager.reset();

        // check inputs
        if (!sessionId) {
          sessionId = bkUtils.generateId(6);
        }

        // reset
        _uriType = uriType;
        _readOnly = readOnly;
        _format = format;
        _notebookUri.set(notebookUri);
        _notebookModel.set(notebookModel);
        _edited = !!edited;
        _sessionId = sessionId;
        _sessionRef = new Firebase(window.fb.ROOT_URL + _sessionId);
        _sessionRef.update({"_notebook": JSON.parse(_notebookModel.toJson())});
        var notebookRef = new Firebase(window.fb.ROOT_URL + _sessionId + "/_notebook");
        notebookRef.on("value", function(snapshot){
          console.log("notebook update", snapshot.val());

          var updatedNotebook = snapshot.val();
          var newCells = updatedNotebook.cells;
          var oldCells = _notebookModel.get().cells;
          var changed = false;
//          if (newCells.length != oldCells.length) {
//            _notebookModel.set(updatedNotebook);
//            changed = true;
//          } else {
          var lastCell = null;
            for (var i = 0; i < oldCells.length; ++i) {
              var newCell = newCells[i];
              var oldCell = oldCells[i];
              console.log("new", newCell, "old", oldCell);
              if (newCell.type !== oldCell.type) {
                oldCells[i] = newCell;
                changed = true;
              } else if (newCell.type === "code"){
                if (newCell.input.body !== oldCell.input.body) {
                  oldCell.input.body = newCell.input.body;
                  changed = true;
                }
                if (newCell.output) {
                  if (!_.isEmpty(newCell.output.evalId) && newCell.output.evalId != oldCell.output.evalId) {
                    var out = new Firebase(window.fb.ROOT_URL + sessionId + "/_evaluations/" + newCell.output.evalId + "/output");
                    oldCell.output = $firebase(out);
                    changed = true;
                  } else if (JSON.stringify(newCell.output.result) !== JSON.stringify(oldCell.output.result)) {
                    oldCell.result = newCell.result;
                    changed = true;
                  }
                }
              } else if (newCell.type === "section") {
                if (newCell.title !== oldCell.title) {
                  oldCell.title = newCell.title;
                  changed = true;
                }
              }
              lastCell = oldCells[i];
            }
            for (;i < newCells.length; ++i) {
              if (newCells[i].type === "code" && !newCells[i].output) {
                newCells[i].output = {};
              }
              bkNotebookCellModelManager.insertAfter(lastCell.id, newCells[i]);
            }
          //}
          if (changed) {
            bkHelper.refreshRootScope();
          }

//          _(updatedNotebook.cells).each(function(cell) {
//            if (cell.type === "code") {
//              var evalId = cell.output.evalId;
//              if (!_.isEmpty(evalId)) {
//                var out = new Firebase(window.fb.ROOT_URL + sessionId + "/_evaluations/" + evalId + "/output");
//                cell.output = $firebase(out);
//                console.log(cell.output);
//              }
//            }
//          });

          //_notebookModel.set(updatedNotebook);
        });

        __evaluations = new Firebase(window.fb.ROOT_URL + _sessionId + "/_evaluations");
        _evaluations = $firebase(__evaluations);
        window._evaluations = _evaluations;
//        __evaluations.on("value", function(snapshot) {
//          window.eve = snapshot.val();
//        });
      },
      clear: function() {
        bkEvaluatorManager.reset();
        _notebookUri.reset();
        _uriType = null;
        _readOnly = null;
        _format = null;
        _notebookModel.reset();
        _sessionId = null;
        _edited = false;
        __evaluations = null;
        _evaluations = null;
      },
      close: function() {
        var self = this;
        var close = function() {
          bkEvaluatorManager.exitAndRemoveAllEvaluators();
          self.clear();
        };
        if (_sessionId) {
          return bkSession.close(_sessionId).then(close);
        } else{
          close();
          return bkUtils.newPromise();
        }
      },
      backup: function() {
        if (_sessionId && !_notebookModel.isEmpty()) {
          return bkSession.backup(_sessionId, generateBackupData());
        } else {
          return bkUtils.newPromise();
        }
      },
      updateNotebookUri: function(notebookUri, uriType, readOnly, format) {
        // to be used by save-as
        _uriType = uriType;
        _readOnly = readOnly;
        _format = format;
        _notebookUri.set(notebookUri);
      },
      getNotebookTitle: function() {
        if (_notebookUri.get()) {
          return _notebookUri.get().replace(/^.*[\\\/]/, '');
        } else {
          return "New Notebook";
        }
      },
      isSavable: function() {
        return _notebookUri && !_readOnly;
      },
      getSaveData: function() {
        return generateSaveData();
      },
      getNotebookModelAsString: function() {
        return _notebookModel.toJson();
      },
      getRawNotebookModel: function() {
        return _notebookModel.get();
      },
      getSessionId: function() {
        return _sessionId;
      },
      getEvaluations: function() {
        return _evaluations;
      },
      // TODO, move the following impl to a dedicated notebook model manager
      // but still expose it here
      setNotebookModelEdited: function(edited) {
        _edited = edited;
        if (edited) {
          console.log("Updating firebase", _notebookModel.get());
          _sessionRef.update({"_notebook": JSON.parse(_notebookModel.toJson())});
        }
      },
      isNotebookModelEdited: function() {
        return _edited;
      },
      isNotebookLocked: function() {
        return _notebookModel.isLocked();
      },
      toggleNotebookLocked: function() {
        if (!_notebookModel.isEmpty()) {
          if (!_notebookModel.isLocked()) {
            _notebookModel.get().locked = true;
          } else {
            _notebookModel.get().locked = undefined;
          }
          this.setNotebookModelEdited(true);
        }
      },
      getNotebookCellOp: function() {
        return bkNotebookCellModelManager;
      },
      getNotebookNewCellFactory: function() {
        return {
          newCodeCell: function(evaluator, id) {
            if (!evaluator) {
              evaluator = _notebookModel.get().evaluators[0].name;
            }
            if (!id) {
              id = "code" + bkUtils.generateId(6);
            }
            return {
              "id": id,
              "type": "code",
              "evaluator": evaluator,
              "input": {
                "body": ""
              },
              "output": {}
            };
          },
          newSectionCell: function(level, title, id) {
            if (!level && level !== 0) {
              level = 1;
            }
            if (level <= 0) {
              throw "creating section cell with level " + level + " is not allowed";
            }
            if (!title) {
              title = "New Section H" + level;
            }

            if (!id) {
              id = "section" + bkUtils.generateId(6);
            }
            return {
              "id": id,
              "type": "section",
              "title": title,
              "level": level
            };
          },
          newTextCell: function(id) {
            if (!id) {
              id = "text" + bkUtils.generateId(6);
            }
            return {
              "id": id,
              "type": "text",
              "body": "New <b>text</b> cell"
            };
          },
          newMarkdownCell: function(id) {
            var tail = _notebookModel.get().cells.length - 1;
            if (!id) {
              id = "markdown" + bkUtils.generateId(6);
            }
            return {
              "id": id,
              "type": "markdown",
              "body": ""
            };
          }
        };
      },
      isRootCellInitialization: function() {
        return _notebookModel.get().initializeAll;
      },
      setRootCellInitialization: function(initialization) {
        if (initialization === true) {
          _notebookModel.get().initializeAll = true;
        } else {
          _notebookModel.get().initializeAll = undefined;
        }
      },
      notebookModelAddEvaluator: function(newEvaluator) {
        _notebookModel.get().evaluators.push(newEvaluator);
      },
      notebookModelGetInitializationCells: function() {
        if (_notebookModel.get().initializeAll) {
          return this.getNotebookCellOp().getAllCodeCells("root");
        } else {
          return this.getNotebookCellOp().getInitializationCells();
        }
      }
    };
  });
})();
