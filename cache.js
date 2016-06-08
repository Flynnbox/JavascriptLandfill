app.cache = (function (deferred, localStore, fileStore) {

	app.log("loading cache.js");

	var initializedDeferred = deferred(),
			cache = {
				initialized: initializedDeferred.promise(),
				addEvent: addEvent,
				updateEvent: updateEvent,
				deleteEvent: deleteEvent,
				clearOfflineCache: clearOfflineCache,
				resetHelpTips: resetHelpVisibility,
				setOrder: setOrder,
				deleteOrder: deleteOrder,
				data: {
					CurrentOrderId: cacheWithBackupStore(bindToDataStore("CURRENTORDERID", localStore)),
					CurrentOrder: null,
					PersistedOrder: bindToDataStoreWithPromiseKey(() => {
						return app.cache.data.CurrentOrderId.get()
							.then(orderId => 'ORDER_' + orderId, error => onCacheError(error, "failed to get key value from promise for PersistedOrder"));
					}, fileStore, null),
					CurrentOrderNotes: bindToDataStoreWithPromiseKey(() => {
						return app.cache.data.CurrentOrderId.get()
							.then(orderId => 'NOTESDATA_' + orderId, error => onCacheError(error, "failed to get key value from promise for CurrentOrderNotes"));
					}, fileStore, { lastSuccessfulUpload: new Date('12/31/1900'), notes: [] }),
					Events: bindToDataStore("EVENTS", fileStore, []),
					Events_DEPRECATED: bindToDataStore("EVENTS", localStore, []),
					LastRefresh: bindToDataStore("LASTREFRESH", localStore),
					HideHelp: bindToDataStore("HIDEHELP", localStore),
					HideSwipeHelp: bindToDataStore("HIDESWIPEHELP", localStore),
					HideNoteHelp: bindToDataStore("HIDENOTEHELP", localStore),
					HideProgramHelp: bindToDataStore("HIDEPROGRAMHELP", localStore),
					HideMapHelp: bindToDataStore("HIDEMAPHELP", localStore),
					HideSessionHelp: bindToDataStore("HIDESESSIONHELP", localStore),
					PlayBackSound: bindToDataStore("PLAYBACKSOUND", localStore),
					Errors: bindToDataStore("ERRORSWAITINGLOG", localStore, []),
					AppLaunchUrl: bindToDataStore("APPLAUNCHURL", localStore),
					ProgramState: bindToDataStore("PROGRAMSTATE", localStore)
				}
			};

	initializeCache();

	return cache; // done with setup; return module variable

	function onCacheError(error, message) {
		app.error.log(error, "onCacheError:" + message, "cache.js");
	}

	function bindToDataStore(dataKey, dataStore, defaultValue) {
		return {
			key: dataKey,
			get: (typeof defaultValue !== 'undefined') ? dataStore.get.bind(undefined, dataKey, defaultValue) : dataStore.get.bind(undefined, dataKey),
			set: dataStore.set.bind(undefined, dataKey),
			remove: dataStore.remove.bind(undefined, dataKey),
			type: dataStore.type
		};
	}

	function bindToDataStoreWithDynamicKey(keyFunction, dataStore, defaultValue) {
		return {
			key: keyFunction,
			get: function() {
				return (typeof defaultValue !== 'undefined') ? dataStore.get(keyFunction(), defaultValue) : dataStore.get(keyFunction());
			},
			set: function(value) {
				return dataStore.set(keyFunction(), value);
			},
			remove: function () {
				return dataStore.remove(keyFunction());
			},
			type: dataStore.type
		};
	}

	function bindToDataStoreWithPromiseKey(keyPromise, dataStore, defaultValue) {
		return {
			key: keyPromise,
			get: function () {
				if (typeof defaultValue !== 'undefined') {
					return keyPromise()
						.then(function(keyValue) {
							return dataStore.get(keyValue, defaultValue);
						})
						.fail(error => onCacheError(error, "bindToDataStoreWithPromiseKey:failed to get key value from promise"));
				} else {
					return keyPromise()
						.then(dataStore.get)
						.fail(error => onCacheError(error, "bindToDataStoreWithPromiseKey:failed to get key value from promise"));
				}
			},
			set: function (value) {
				return keyPromise().then(keyValue => dataStore.set(keyValue, value), error => onCacheError(error, "bindToDataStoreWithPromiseKey:failed to get key value from promise"));
			},
			remove: function () {
				return keyPromise().then(keyValue => dataStore.remove(keyValue), error => onCacheError(error, "bindToDataStoreWithPromiseKey:failed to get key value from promise"));
			},
			type: dataStore.type
		};
	}

	//creates an in-memory object synced to a data store
	function cacheWithBackupStore(configuredStore) {
		var value = null;

		return {
			key: configuredStore.key,
			get: function () {
				if (value) {
					var dfd = deferred();
					dfd.resolve(value);
					return dfd.promise();
				}
				return configuredStore.get().then(newValue => value = newValue);
			},
			set: function (newValue) {
				value = newValue;
				return configuredStore.set(value);
			},
			remove: function () {
				value = null;
				return configuredStore.remove();
			},
			clearCache: function () {
				var dfd = deferred();
				value = null;
				dfd.resolve();
				return dfd.promise();
			},
			type: configuredStore.type
		};
	}

	function resetHelpVisibility() {
		cache.data.HideHelp.remove();
		cache.data.HideSwipeHelp.remove();
		cache.data.HideNoteHelp.remove();
		cache.data.HideMapHelp.remove();
		cache.data.HideProgramHelp.remove();
		cache.data.HideSessionHelp.remove();

		app.main.currentState.hideHelp = false;
		app.main.currentState.hideSwipeHelp = false;
		app.main.currentState.hideNoteHelp = false;
		app.main.currentState.hideMapHelp = false;
		app.main.currentState.hideProgramHelp = false;
		app.main.currentState.hideSessionHelp = false;
	};

	function clearOfflineCache() {
		cache.data.Events.remove();
	};

	//IMPORTANT: Ensure that CurrentOrder and PersistedOrder remain in sync
	function setOrder(order) {
		app.log("setting current & persistent order");
		return cache.data.PersistedOrder.set(order)
			.then(function() {
				app.cache.data.CurrentOrder = order;
			});
	}

	//IMPORTANT: Ensure that CurrentOrder and PersistedOrder remain in sync
	function deleteOrder() {
		app.log("deleting current & persistent order");
		return cache.data.PersistedOrder.remove()
			.then(function () {
				app.cache.data.CurrentOrder = null;
			});
	}

	function projectOrderToEventListItem(order) {
		return {
			orderId: order.orderDetail.orderId,
			eventTitle: order.offeringEvent.title,
			eventCode: order.offeringEvent.code,
			attendeeName: order.orderDetail.fullName
		};
	}

	function addEvent(order) {
		var event = projectOrderToEventListItem(order);

		return cache.data.Events.get()
			.then(function (events) {
				events.push(event);
				return cache.data.Events.set(events);
			})
			.fail(function (error) {
				onCacheError(error, "addEvent:failed to insert order " + order.orderId + " into cache");
			});
	};

	function updateEvent(order) {
		var event = projectOrderToEventListItem(order);

		return cache.data.Events.get()
			.then(function (events) {
				//remove the event from the array
				var theOtherEvents = $.grep(events, function (item) { return item.orderId !== event.orderId; });
				theOtherEvents.push(event);
				return cache.data.Events.set(theOtherEvents);
			})
			.fail(function (error) {
				onCacheError(error, "updateEvent:failed to update order " + order.orderId + " within cache");
			});
	};

	function deleteEvent(orderId) {
		return cache.data.Events.get()
			.then(function(events) {
				//remove the event from the array
				var theOtherEvents = $.grep(events, function(item) { return item.orderId !== orderId; });
				return cache.data.Events.set(theOtherEvents);
			})
			.fail(function(error) {
				onCacheError(error, "deleteEvent:failed to delete order " + orderId + " from cache");
			});
	};
	
	function initializeCache() {
		app.log("initializing cache");
		$.when(localStore.initialized, fileStore.initialized)
			.then(cache.data.Events.get)
			.then(function(events) {
				//if no events in fileStorage, try local storage
				if (events.length === 0) {
					app.log("events not found in fileStorage, checking localStorage for data");
					return cache.data.Events_DEPRECATED.get()
						.then(function (events) {
							//check to see that some event data was found
							if (events.length === 0) {
								app.warn("initializeCache:No event data exists in fileStorage or localStorage");
								amplify.publish(app.events.appState.errorNoEventData);
								return events;
							}
							app.log("updating fileStorage events with localStorage events value");
							cache.data.Events.set(events);
							cache.data.Events_DEPRECATED.remove();
							return events;
						});
				}
				cache.data.Events_DEPRECATED.remove();
				return events;
			})
			.then(function () {
				app.log("cache.js initialized");
				initializedDeferred.resolve();
			})
			.fail(function (error) {
				onCacheError(error, "initializeCache:failed to initialize cache");
				initializedDeferred.reject(error);
			});
	};
})(jQuery.Deferred, app.localStorage, app.fileStorage);