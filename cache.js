app.cache = (function (deferred, localStore, fileStore) {

	app.log("loading cache.js");

	var initializedDeferred = deferred(),
			cache = {
				initialized: initializedDeferred.promise(),
				addEvent: addEvent,
				saveToCache: persistToStore,
				clearOfflineCache: clearOfflineCache,
				resetHelpTips: resetHelpVisibility,
				updateEvent: updateEvent,
				deleteEvent: deleteEvent,
				data: {
					CurrentOrder: null,
					CurrentOrder2: cacheWithBackupStore(() => {
						return 'ORDER_' + app.cache.data.CurrentOrder.orderDetail.orderId;
					}, fileStore),
					CurrentOrderId: bindToDataStore("CURRENTORDERID", localStore),
					CurrentOrderNotes: bindToDataStoreWithDynamicKey(() => {
						return 'NOTESDATA_' + app.cache.data.CurrentOrder.orderDetail.orderId;
					}, localStore, { lastSuccessfulUpload: new Date('12/31/1900'), notes: [] }),
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

	function bindToDataStore(dataKey, dataStore, defaultValue) {
		return {
			key: dataKey,
			get: (typeof defaultValue !== 'undefined') ? dataStore.get.bind(undefined, dataKey, defaultValue) : dataStore.get.bind(undefined, dataKey),
			set: dataStore.set.bind(undefined, dataKey),
			remove: dataStore.remove.bind(undefined, dataKey),
			dataStore: dataStore.type
		};
	}

	function bindToDataStoreWithDynamicKey(keyFunction, dataStore, defaultValue) {
		return {
			key: keyFunction,
			get: function() {
				return (typeof defaultValue !== 'undefined') ? dataStore.get(this.key(), defaultValue) : dataStore.get(this.key());
			},
			set: function(value) {
				return dataStore.set(this.key(), value);
			},
			remove: function () {
				return dataStore.remove(this.key());
			},
			dataStore: dataStore.type
		};
	}

	//creates an in-memory object synced to a data store
	function cacheWithBackupStore(keyOrKeyFunction, configuredStore) {
		var value = null,
		    isKeyFunction = $.isFunction(keyOrKeyFunction);

		return {
			key: function() {
				return isKeyFunction ? keyOrKeyFunction() : keyOrKeyFunction;
			},
			get: function () {
				if (value) {
					var dfd = deferred();
					dfd.resolve(value);
					return dfd.promise();
				}
				return configuredStore.get(this.key()).then(newValue => value = newValue);
			},
			set: function (newValue) {
				value = newValue;
				return configuredStore.set(this.key(), value);
			},
			remove: function () {
				value = null;
				return configuredStore.remove(this.key());
			},
			dataStore: configuredStore.type
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

	function addEvent(order) {
		//clear notes before storing to ls - notes stored separately from order
		order.orderDetail.userSessionNotes.notes = [];

		return cache.data.Events.get()
			.then(function (events) {
				events.push(order);
				return cache.data.Events.set(events);
			})
			.fail(function (error) {
				app.error.log(error, "addEvent:failed to insert order " + orderId + " into cache", "cache.js");
			});
	};

	function updateEvent(order) {
		//clear notes before storing to ls- notes stored separately from order
		order.orderDetail.userSessionNotes.notes = [];

		return cache.data.Events.get()
			.then(function (events) {
				//remove the event from the array
				var theOtherEvents = $.grep(events, function (item) { return item.orderDetail.orderId !== order.orderDetail.orderId; });
				theOtherEvents.push(order);
				return cache.data.Events.set(theOtherEvents);
			})
			.fail(function (error) {
				app.error.log(error, "updateEvent:failed to update order " + orderId + " within cache", "cache.js");
			});
	};

	function deleteEvent(orderId) {
		return cache.data.Events.get()
			.then(function(events) {
				//remove the event from the array
				var theOtherEvents = $.grep(events, function(item) { return item.orderDetail.orderId !== orderId; });
				return cache.data.Events.set(theOtherEvents);
			})
			.fail(function(error) {
				app.error.log(error, "deleteEvent:failed to delete order " + orderId + " from cache", "cache.js");
			});
	};

	//save to data to storage
	function persistToStore(key, newDataToPersist) {
		try {
			app.log("invoking persistToStore: refactor to replace call with cache.data.[" + key + "].set()");

			amplify.store(key, newDataToPersist);
			cache.data.LastRefresh.set(new Date());
		}
		catch (error) {
			app.error.log(error, 'persistToStore: The maximum storage space may have been exceeded', 'cache.js');

			//amplify.publish(app.events.appState.errorOccurred, error); //potential logic error - instead we should ask more space
			toastr.error('The maximum storage space been exceeded. You need to delete any old events to clear up some space');
		}
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
				app.error.log(error, "initializeCache:failed to initialize cache", "cache.js");
				initializedDeferred.reject(error);
			});
	};
})(jQuery.Deferred, app.localStorage, app.fileStorage);