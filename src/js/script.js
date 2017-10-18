'use strict';

const MLEMessageTypes = {
	SaveSuccess: 'mle-save-success',
	SaveFail: 'mle-save-fail',
	InvokeMLESave: 'mle-save-data',
	IFrameInitialized: 'mle-child-initialized'
};

const MLEConstants = {
	MLEFrameOptions: {
		Params: {
			ChildFrameId: 'mleChildFrameId',
			BatchSize: 'batchSize',
			ShowHeader: 'showHeader',
			ShowSideBar: 'sideBar',
			Embedded: 'embedded',
			DefinitionId: 'productDefinitionId',
			CssOverride: 'cssoverride',
			JsOverride: 'scriptplugin',
			LinkedId: 'id'
		},
		DefaultPage: 'csmle__Editor',
		DefaultClass: 'mle-iframe'
	},
	ContextDelimiter: '::'
};

function buildMleHooksMessage(identifier, type, context, body) {
	let retVal = `${identifier}${MLEConstants.ContextDelimiter}${type}${MLEConstants.ContextDelimiter}${context}`;
	if (body) {
		retVal = `${retVal}${MLEConstants.ContextDelimiter}${JSON.stringify(body)}`;
	}
	return retVal;
}

function readMleMsgTypeAndContext(message) {
	const typeAndContext = message.split(MLEConstants.ContextDelimiter);
	return {
		identifier: typeAndContext[0],
		type: typeAndContext[1],
		context: typeAndContext[2],
		body: typeAndContext[3] && typeof typeAndContext[3] === 'string' ? JSON.parse(typeAndContext[3]) : typeAndContext[3]
	};
}

function readSearchParameters() {
	const retVal = {};
	window.location && window.location.search && window.location.search.substring(1).split('&').forEach(
		function(keyValueParams) {
			const keyValueArray = keyValueParams.split('=');
			retVal[keyValueArray[0]] = keyValueArray[1];
		}
	);
	return retVal;
}

/*
 * MLE child frame code
 */

(function() {

	// workaround to get number of stored configurations
	let workaroundNumberOfSavedConfigurations = 0;

	waitForMLEAPIAsync()
		.then(
			mleAPI => populateMissingMLEAPIFunctionsAsync(mleAPI),
			error => {
				console.log('MLE-v2-cfg: unable to find MLE API', error);
				return Promise.reject(error);
			}
		).then(
			mleAPI => initializeMessagingAPI(mleAPI)
		);

	function waitForMLEAPIAsync() {
		return new Promise(
			(resolve, reject) => {
				const intervalMaxCount = 10;
				let intervalCount = 0;

				const intervalRef = setInterval(
					function() {
						const mleAPI = window.CSMLEAPI;

						if (!mleAPI) {
							intervalCount++;
							if (intervalCount >= intervalMaxCount) {
								reject('Unable to read MLE API');
								clearInterval(intervalRef);
							}
							return;
						}

						clearInterval(intervalRef);
						resolve(mleAPI);
					},
					100
				);
			}
		);
	}

	function populateMissingMLEAPIFunctionsAsync(mleAPI) {
		return waitForScopeInitialisationAsync()
			.then(
				$scope => {
					mleAPI.$scope = $scope;
					const oldSave = $scope.save;
					$scope.save = function mleIframeSave() {
						workaroundNumberOfSavedConfigurations = calculateNumberOfToBeSavedItems($scope);
						oldSave.apply($scope, arguments);
					};

					return mleAPI;
				},
			);
	}

	function waitForScopeInitialisationAsync() {
		function readScope() {
			return angular.element('.container').scope();
		}

		const $scope = readScope();
		if ($scope != null) {
			return Promise.resolve($scope);
		}

		return new Promise(
			(resolve, reject) => {
				const intervalMaxCount = 10;
				let intervalCount = 0;

				const intervalRef = setInterval(
					function() {
						const $scope = readScope();

						if (!$scope || !$scope.save) {
							intervalCount++;
							if (intervalCount >= intervalMaxCount) {
								reject('Unable to read MLE $scope');
								clearInterval(intervalRef);
							}
							return;
						}

						clearInterval(intervalRef);
						resolve($scope);
					},
					100
				);
			}
		);
	}

	function initializeMessagingAPI(mleAPI) {

		function populateListeneres() {
			mleAPI.onSaveSuccess(sendMleSaveSuccessMessage);
			mleAPI.onSaveError(sendMleSaveFailMessage);
		}

		function destroyListeners() {
			mleAPI.onSaveSuccess(undefined);
			mleAPI.onSaveError(undefined);
		}

		function invokeSaveAsync() {
			var numberOfChangedItems = calculateNumberOfToBeSavedItems(mleAPI.$scope);
			if (numberOfChangedItems > 0) {
				// not to send single message twice
				destroyListeners();
				return mleAPI
					.saveAsync()
					.then(
						() => {
							populateListeneres();
							return numberOfChangedItems;
						},
						e => {
							populateListeneres();
							return Promise.reject(e);
						}
					);
			} else {
				return Promise.resolve(0);
			}
		}

		let searchParams = readSearchParameters();
		populateListeneres();
		window.addEventListener(
			'message',
			function (event) {
				const mleMsg = readMleMsgTypeAndContext(event.data);
				if (mleMsg.type === MLEMessageTypes.InvokeMLESave) {
					invokeSaveAsync()
						.then(
							sendMleSaveSuccessMessage,
							sendMleSaveFailMessage
						).catch(
						sendMleSaveFailMessage
					);
				}
			}
		);

		window.parent.postMessage(
			buildMleHooksMessage(getMleChildFrameIdentifier(), MLEMessageTypes.IFrameInitialized, getMleChildFrameIdentifier()),
			'*'
		);

		function sendMleSaveSuccessMessage(numberOfSavedConfigs) {
			numberOfSavedConfigs = numberOfSavedConfigs || workaroundNumberOfSavedConfigurations;
			window.parent.postMessage(
				buildMleHooksMessage(
					getMleChildFrameIdentifier(),
					MLEMessageTypes.SaveSuccess,
					getMleChildFrameIdentifier(),
					{
						ignoreRuleExecution: !numberOfSavedConfigs,
						numberOfSavedConfigs: numberOfSavedConfigs
					}
				),
				'*'
			);
		}

		function sendMleSaveFailMessage() {
			window.parent.postMessage(
				buildMleHooksMessage(getMleChildFrameIdentifier(), MLEMessageTypes.SaveFail, getMleChildFrameIdentifier()),
				'*'
			);
		}

		function getMleChildFrameIdentifier() {
			searchParams = searchParams || readSearchParameters();
			return searchParams[MLEConstants.MLEFrameOptions.Params.ChildFrameId];
		}
	}

	function calculateNumberOfToBeSavedItems($scope) {
		return $scope.CsService.grid.data.reduce(
			function (agg, row) {
				return agg + (row._MLE_Saved_Status === 'Changed' ? 1: 0)
			},
			0
		);
	}
})();

/*
 * configurator code handling
 */
(function() {
	// will work this only if we have require defined
	if (typeof define === 'function') {
		define(
			'mle-v2-api',
			['./src/cs-full'],
			function (CS) {
				class QueueElement {
					constructor(value) {
						this.value = value;
					}
				}

				class Queue {
					constructor() {
					}

					push(value) {
						const element = new QueueElement(value);
						if (!this._head) {
							this._head = element;
						} else if (this._tail) {
							this._tail.next = element;
						}

						this._tail = element;

						return true;
					}

					pop() {
						const retVal = this._head && this._head.value;
						if (this._head) {
							if (this._head === this._tail) {
								delete this._head;
								delete this._tail;
							} else {
								this._head = this._head.next;
							}
						}

						return retVal;
					}

					popAll() {
						const retVal = [];
						let element = this._head;

						delete this._head;
						delete this._tail;

						while (element) {
							retVal.push(element.value);
							element = element.next;
						}

						return retVal;
					}

					remove(value) {
						let element = this._head;
						if (!element) {
							return false;
						}

						if (element.value === value) {
							this._head = element.next;
							// it was first & last element
							if (element === this._tail) {
								delete this._head;
								delete this._tail;
							}
						}

						while (element) {
							if (element.next && element.next.value === value) {
								if (element.next === this._tail) {
									this._tail = element;
								}
								element.next = element.next.next;
								
								return true;
							}
							element = element.next;
						}

						return false;
					}

					size() {
						let count = 0;
						let element = this._head;
						while(element) {
							count ++;
							element = element.next;
						}
						return count;
					}
				}

				const internalMLEStructures = {};

				function initMleHandleQueues(mleProperties) {
					mleProperties.handlerQueue = {};
					Object.keys(MLEMessageTypes).forEach(
						function(msgTypeName) {
							mleProperties.handlerQueue[MLEMessageTypes[msgTypeName]] = new Queue();
						}
					);
				}

				function initMleHooks(mleProperties) {
					mleProperties.hooks = {};
					mleProperties.hooks[MLEMessageTypes.SaveSuccess] = mleProperties.onSaveSuccess;
					mleProperties.hooks[MLEMessageTypes.SaveFail] = mleProperties.onSaveFail;
					mleProperties.hooks[MLEMessageTypes.IFrameInitialized] = mleProperties.onInitialize;
				}

				function updateAttributeValue(props) {
					CS.setAttributeValue(props.attributeName, props.attributeValue);
				}

				function buildMleIframeAttributeValue(props) {
					const origin = window.location.origin;
					const sitePrefix = props.sitePrefix || '';
					const iframeId = `mle-iframe-${props.identifier}`;
					const iframeClassExtensions = props.iframeClasses || '';
					const mlePage = props.mlePage || MLEConstants.MLEFrameOptions.DefaultPage;
					const mleIframeStyle = props.iframeStyle || '';

					const parametersString = buildMleIframeParameterString(props);
					return `<iframe id="${iframeId}" src="${origin}${sitePrefix}/apex/${mlePage}?${parametersString}" class="${MLEConstants.MLEFrameOptions.DefaultClass} ${iframeClassExtensions}" style="${mleIframeStyle}"></iframe>`;
				}

				function buildMleIframeParameterString(props) {
					return [
						{
							name: MLEConstants.MLEFrameOptions.Params.ChildFrameId,
							value: props.identifier
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.BatchSize,
							value: props.batchSize || 5
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.ShowHeader,
							value: false
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.ShowSideBar,
							value: false
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.Embedded,
							value: true
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.DefinitionId,
							value: props.definitionId
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.CssOverride,
							value: props.css
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.JsOverride,
							value: props.js
						},
						{
							name: MLEConstants.MLEFrameOptions.Params.LinkedId,
							value: props.linkedId || CS.params.linkedId
						}
					]
					.filter(o => o.value !== undefined)
					.map(o =>`${o.name}=${o.value}`)
					.join('&');
				}

				function storeMLEAsync(mleProps) {
					return new Promise(
						(resolve, reject) => {
							function saveSuccessHandler() {
								resolve(true);
								removeHandlers();
							}

							function saveFailHandler(error)  {
								reject(error || 'Error while saving mle iframe');
								removeHandlers();
							}

							function removeHandlers() {
								const successHandlerRemoved = removeHandler(mleProps, MLEMessageTypes.SaveSuccess, saveSuccessHandler);
								const failHandlerRemoved = removeHandler(mleProps, MLEMessageTypes.SaveFail, saveFailHandler);

								return successHandlerRemoved || failHandlerRemoved;
							}

							function addHandlers() {
								enqueueHandler(mleProps, MLEMessageTypes.SaveSuccess, saveSuccessHandler);
								enqueueHandler(mleProps, MLEMessageTypes.SaveFail, saveFailHandler);
							}

							if (!mleProps.iframeWindow) {
								console.error(`MLE frame for ${mleProps.identifier} not initialized`, 'Ignoring error, for now');
								reject(`MLE frame for ${mleProps.identifier} not initialized`);
							} else {
								try {
									addHandlers();
									invokeMLEStore(mleProps);
								} catch (e) {
									removeHandlers();
									console.error(`Error while invoking save MLE for ${mleProps.identifier}`, e, 'Ignoring error, for now');
									resolve(true);
								}
							}
						}
					);
				}

				function invokeMLEStore(mleProps) {
					mleProps.iframeWindow.postMessage(
						buildMleHooksMessage(mleProps.identifier, MLEMessageTypes.InvokeMLESave, mleProps.identifier),
						'*'
					);
				}

				function enqueueHandler(mleProps, forType, handler) {
					return mleProps.handlerQueue[forType].push(handler);
				}

				function removeHandler(mleProps, forType, handler) {
					return mleProps.handlerQueue[forType].remove(handler);
				}

				function initMLE(opts) {
					if (!opts.definitionId) {
						throw `Please provide definitionId option when initializing MLE`;
					}

					if (!opts.attributeName) {
						throw `Please provide attributeName option when initializing MLE`;
					}

					const identifier = opts.identifier || opts.attributeName;

					let mleProperties = internalMLEStructures[identifier];

					if (!mleProperties) {
						mleProperties = Object.assign({}, opts);
						// define default identifier
						mleProperties.identifier = identifier;
						internalMLEStructures[identifier] = mleProperties;

						initMleHandleQueues(mleProperties);
					}
					// hooks can be overwritten
					initMleHooks(mleProperties);

					mleProperties.attributeValue = buildMleIframeAttributeValue(mleProperties);
					updateAttributeValue(mleProperties);
				}

				// listener from child frames
				window.addEventListener(
					'message',
					function(event) {
						const message = readMleMsgTypeAndContext(event.data);
						const mleProps = internalMLEStructures[message.identifier];
						// it is expected that context is allways mle identifier
						if (mleProps) {
							console.log(`Received MLE message "${message.type}" from "${mleProps.identifier}"`);
							if (message.type === MLEMessageTypes.IFrameInitialized) {
								mleProps.iframeWindow = event.source;
								mleProps.initialized = true;
								console.log(`MLE iframe "${mleProps.identifier}"" initialized`);
							}

							invokeQueue(mleProps.handlerQueue[message.type], message);

							if (message.type !== MLEMessageTypes.IFrameInitialized && (!message.body || !message.body.ignoreRuleExecution)) {
								CS.rules.evaluateAllRules();
							}

							invokeHook(mleProps.hooks && mleProps.hooks[message.type], message);

							console.log(`Processed MLE message "${message.type}" from "${mleProps.identifier}"`);
						}

						function invokeQueue(queue, message) {
							queue && queue.popAll().forEach(
								function(handler) {
									if (typeof handler === 'function') {
										try {
											handler(message);
										} catch (e) {
											console.error('Error while invoking handler', e);
										}
									}
								}
							);
						}

						function invokeHook(hook, message) {
							typeof hook === 'function' && hook(message);
						}
					}
				);

				CS.SE = CS.SE || {};
				CS.SE.MLE = {
					init: initMLE,
					MessageTypes: Object.assign({}, MLEMessageTypes),
					util: {
						readMleMsgTypeAndContext: readMleMsgTypeAndContext,
						buildMleHooksMessage: buildMleHooksMessage
					},
					getIframeWindow: function (identifier) {
						return internalMLEStructures[identifier] && internalMLEStructures[identifier].iframeWindow;
					},
					saveAllAsync: function() {
						const promises = [];
						Object.keys(internalMLEStructures).forEach(
							function(identifier) {
								const mleProps = internalMLEStructures[identifier];
								mleProps.initialized && promises.push(storeMLEAsync(mleProps));
							}
						);

						return Promise.all(promises);
					},
					saveAsync: function(identifier) {
						const mleProps = internalMLEStructures[identifier];
						if (!mleProps) {
							return Promise.reject(`MLE "${identifier}" not initialized`);
						}
						return storeMLEAsync(mleProps);
					},
					reloadTopParentOnFinish: false
				};

				return CS.SE.MLE;
			}
		);

		require(
			['mle-v2-api'],
			function(mleAPI) {
				console.log('MLE v2 API initialised. Use CS.SE.MLE as reference.', mleAPI);

				const oldFinish = window.finish;
				if (typeof oldFinish === 'function') {
					window.finish = function finishOverride() {
						const args = arguments;
						mleAPI
							.saveAllAsync()
							.then(
								() => oldFinish(args),
								e => CS.Log.error('Error while saving MLE before configurator finish', e)
							);
					}
				}
			}
		);
	}
})();