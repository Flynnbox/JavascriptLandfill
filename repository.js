app.repository = (function (deferred, cache, serviceApi, appSettings) {

	app.log("loading repository.js");

	var initializedDeferred = deferred(),
			rightnow = ko.observableArray(),
			currentAnnouncements = ko.observableArray(),
			topTweet = ko.observable({ text: 'top tweet not loaded yet', user: { screenName: '' } }),
			computedNewAnnouncementsCount = ko.computed(calculateNewAnnouncementCount),
			computedTopAnnouncement = ko.computed(calculateTopAnnouncement),
			rightNowPollingFrequency = appSettings.rightNowPollingFrequencyInSecs * 1000,
			rightNowInterval = null,
			newDataPollingFrequency = (appSettings.newDataPollingFrequencyInSecs + Math.floor(Math.random() * 3 * 60)) * 1000,
			dataPollingInterval = null,
			notesPollingInterval = null,
			nothingNow = { "id": -1, "title": "Nothing Right Now", "description": "Tap to view your schedule", "room": "", "typeColor": "red" },
			rep = {
				initialized: initializedDeferred.promise(),
				getOrder: getOrder,
				getLocalOrder: lookupOrder,
				refreshOfflineData: refreshOfflineData,
				setHideHelp: setHideHelp,
				setHideSwipeHelp: setHideSwipeHelp,
				setHideNoteHelp: setHideNoteHelp,
				setHideMapHelp: setHideMapHelp,
				setHideProgramHelp: setHideProgramHelp,
				setHideSessionHelp: setHideSessionHelp,
				setPlayBackSound: setPlayBackSound,
				getEvents: getEvents,
				setCurrentOrder: setCurrentOrder,
				getRightNow: getRightNow,
				getCurrentAnnouncements: getCurrentAnnouncements,
				getTopTweet: getTopTweet,
				getNewAnnouncementCount: getNewAnnouncementCount,
				getTopAnnouncement: getTopAnnouncement,
				getTweets: getTweets,
				getPresenter: getPresenter,
				getPresenters: getPresenters,
				getSession: getSession,
				getCredit: getCredit,
				getSponsorTypes: getSponsorTypes,
				getSessionStyle: getSessionStyle,
				getSponsorsByType: getSponsorsByType,
				getExhibitor: getExhibitor,
				getNotesData: getNotesData,
				getUpdatedNotes: getUpdatedNotes,
				getSessionNote: getSessionNote,
				saveSessionNote: saveSessionNote,
				saveSessionNotesToServer: saveSessionNotesToServer,
				getSessionType: getSessionType,
				getResources: getResources,
				getRoom: getRoom,
				getCluster: getCluster,
				refreshOrder: refreshOrder,
				ensureSessionHasTypeColor: ensureSessionHasTypeColor,
				deleteLocalOrder: deleteLocalOrder,
				initializeData: initializeData
		};

	return rep; // done with setup; return module variable

	//adds sessionTypeColor to session object if it doesn't already and it looks up the color based on the id
	function ensureSessionHasTypeColor(session) {
		if (!session.hasOwnProperty('sessionTypeColor')) { session.sessionTypeColor = getSessionType(session.sessionTypeId).color; }
	}

	//called in startup.js to control the program flow
	function initializeData() {
		cache.initialized
			.then(function() {
				//subscribe to app events
				amplify.subscribe(app.events.appState.userViewedAnnouncements, clearNewAnnouncementStatus);

				//grab initial values from cache
				cache.data.HideHelp.get().done(value => app.main.currentState.hideHelp = value || false);
				cache.data.HideSwipeHelp.get().done(value => app.main.currentState.hideSwipeHelp = !app.main.isiOS || value);
				cache.data.HideNoteHelp.get().done(value => app.main.currentState.hideNoteHelp = value || false);
				cache.data.HideMapHelp.get().done(value => app.main.currentState.hideMapHelp = value || false);
				cache.data.HideProgramHelp.get().done(value => app.main.currentState.hideProgramHelp = value || false);
				cache.data.HideSessionHelp.get().done(value => app.main.currentState.hideSessionHelp = value || false);
				cache.data.PlayBackSound.get().done(value => app.main.currentState.playBackSound = value || true);

				return cache.data.CurrentOrderId.get();
			})
			.then(lookupOrder)
			.then(function(order){
				if (order) {
					app.log("order data found in cache for order id: " + order.orderDetail.orderId);
					setCurrentOrder(order);
				} else {
					app.warn("order data was not found in cache for order");
				}

				app.log("repository.js initialized");
				initializedDeferred.resolve();
			})
			.fail(function(error) {
				app.error.log(error, "initializeData:failed to initialize repository data", "repository.js");
				initializedDeferred.reject(error);
			});
	}

	//resets all of the isNew flags on the current announcements
	function clearNewAnnouncementStatus() {
		for (var i = 0; i < currentAnnouncements().length; i++) {
			currentAnnouncements()[i].isNew = false;
		}
	}

	//returns right now observable array
	function getRightNow() {
		return rightnow;
	};

	//return new announcementCount computed observable
	function getNewAnnouncementCount() {
		return computedNewAnnouncementsCount;
	}

	//return topAnnouncement computed observable
	function getTopAnnouncement() {
		return computedTopAnnouncement;
	}

	//return the top tweet observable
	function getTopTweet() {
		return topTweet;
	};

	//start the poller that checks for Right Now sessions
	function initializeRightNowPolling() {
		if (rightNowInterval) {
			clearInterval(rightNowInterval);
		}
		//put the 'nothing new' item on the right now collection
		if (rightnow().length === 0) {
			rightnow.push(nothingNow);
		}

		app.Common.defer(updateNowCollection);

		rightNowInterval = setInterval(function () { app.Common.defer(updateNowCollection) }, rightNowPollingFrequency);
		app.log('started the right now polling');
	};

	//determines the sessions to consider as Right Now sessions
	function updateNowCollection() {

		refreshCurrentAnnouncementsFromOrder(app.cache.data.CurrentOrder);
		var userSessions = app.cache.data.CurrentOrder.userSessions;
		var current = app.deviceClock.moment();

		var nextSession = $.grep(userSessions, function (session) {
			var startDiff = moment(session.startDate).diff(current, 'minutes');
			//starts in less than 50 mins or started 10 mins or less ago 
			return (startDiff < 50 && startDiff > -30);
		})[0] || nothingNow;

		var newNow;

		//only do this if the current items are different than the previous
		if (rightnow().length > 0 && rightnow()[0].id !== nextSession.id) {
			if (nextSession.id !== -1) {

				var type = getSessionType(nextSession.sessionTypeId);

				newNow = [{
					"id": nextSession.id,
					"title": moment(nextSession.startDate).format("h:mm a") + " - " +
								moment(nextSession.endDate).format("h:mm a") + " " + type.title,
					"description": nextSession.code + ": " + nextSession.title,
					"room": nextSession.room.roomId ? getCluster(nextSession.room.clusterId).name + ": " + getRoom(nextSession.room.roomId).name : "no room",
					"typeColor": type.color
				}];
			}
			else {
				newNow = [nothingNow];
			}
			rightnow.removeAll();
			ko.utils.arrayPushAll(rightnow, newNow);
			rightnow.valueHasMutated();
		}
		else {
			app.log('checked right now on schedule - no change');
		}
		app.main.dataPollingDx.nowUpdated(moment());
	};

	//start poller that checks for updated data for the current event
	function initializeUpdatedDataPolling() {

		if (dataPollingInterval) {
			clearInterval(dataPollingInterval);
		}
		app.Common.defer(checkServerForNewData, 30000);
		dataPollingInterval = setInterval(function () { app.Common.defer(checkServerForNewData) }, 30000 + newDataPollingFrequency);
		app.log('started the new data polling');
	};

	//start the poller that checks for updated notes for the current event
	function initializeNotesUploadPolling() {
		if (notesPollingInterval) {
			clearInterval(notesPollingInterval);
		}
		app.Common.defer(saveSessionNotesToServer, 20000);
		dataPollingInterval = setInterval(function () { app.Common.defer(saveSessionNotesToServer) }, 30000 + newDataPollingFrequency);
		app.log('started notes upload polling');
	}

	//stops the periodic polling process - dataupdates, error and notes uploading
	function stopPolling() {
		if (dataPollingInterval) {
			clearInterval(dataPollingInterval);
			app.log('stopped the new data polling');
		}
		if (rightNowInterval) {
			clearInterval(rightNowInterval);
			app.log('stopped the right now polling');
		}
		if (notesPollingInterval) {
			clearInterval(notesPollingInterval);
			app.log('stopped the notes upload polling');
		}
	};

	//ask server to see if there is any updated data for the current event
	function checkServerForNewData() {
		//get data dates and build payload
		var order = app.cache.data.CurrentOrder;

		if (order) {

			var dataFreshness = {
				orderId: order.orderDetail.orderId,
				offeringId: order.offeringEvent.offeringId,
				offeringEventChecksum: order.offeringEvent.checksum ? order.offeringEvent.checksum : 0,
				announcementsChecksum: order.announcements.checksum ? order.announcements.checksum : 0,
				materialsChecksum: order.materials.checksum ? order.materials.checksum : 0,
				resourcesChecksum: order.resources.checksum ? order.resources.checksum : 0,
				featuresChecksum: order.features.checksum ? order.features.checksum : 0,
				enrollmentId: order.orderDetail.enrollmentId ? order.orderDetail.enrollmentId : 0
			};

			//poll server for event updates
			serviceApi.checkServerForNewData(dataFreshness)
			.done(function (updatesResponse) {
				if (updatesResponse.payload.orderId === order.orderDetail.orderId) {
					processUpdates(updatesResponse.payload);
				}
				app.main.dataPollingDx.serverPolled(moment()); //successful polling
			});

			//get latest tweet from server
			refreshTopTweetFromServer();
		}
	};

	//updates the current event with the updated data from the server
	function processUpdates(updatesResponse) {
		//announcements
		if (updatesResponse.announcementsUpdateAvailable) {

			app.Common.defer(getUpdatedAnnouncements);
		}

		//materials
		if (updatesResponse.materialsUpdateAvailable) {
			app.Common.defer(getUpdatedMaterials);
		}

		//resources
		if (updatesResponse.resourcesUpdateAvailable) {
			app.Common.defer(getUpdatedResources);
		}

		//features
		if (updatesResponse.featuresUpdateAvailable) {
			app.Common.defer(getUpdatedFeatures);
		}

		//event
		if (updatesResponse.offeringEventUpdateAvailable) {
			//amplify.publish(app.events.dataUpdates.event); // stopped showing notification to user
			app.Common.defer(refreshOrder(app.cache.data.CurrentOrder.orderDetail.orderId)
				.fail(function (hxr) {
					app.log('updated order failed to download');
				}));
		}

		//order user sessions
		if (updatesResponse.orderScheduleUpdateAvailable) {
			app.Common.defer(getUpdatedOrderSessions);
		}
	}

	function getUpdatedAnnouncements() {
		serviceApi.getAnnouncements(app.cache.data.CurrentOrder.orderDetail.orderId, app.cache.data.CurrentOrder.offeringEvent.offeringId)
		.done(function (response) {
			if (response.payload.offeringId === app.cache.data.CurrentOrder.orderDetail.offeringId) {
				//replace announcements collection
				app.cache.data.CurrentOrder.announcements = response.payload;
				//force the current announcements collection to refresh
				refreshCurrentAnnouncementsFromOrder(app.cache.data.CurrentOrder);
				cache.updateEvent(app.cache.data.CurrentOrder);

				app.main.dataPollingDx.announcementsUpdated(moment());
			}
		})
		.fail(function (hxr) {
			app.log('updated announcements failed to download');
		});
	}

	function getUpdatedMaterials() {
		serviceApi.getMaterials(app.cache.data.CurrentOrder.orderDetail.orderId, app.cache.data.CurrentOrder.offeringEvent.offeringId)
		.done(function (response) {
			//update the materials collection in the current event
			app.cache.data.CurrentOrder.materials = response.payload;
			cache.updateEvent(app.cache.data.CurrentOrder);
			app.main.dataPollingDx.materialsUpdated(moment());
		})
		.fail(function (hxr) {
			app.log('updated materials failed to download');
		});
	}

	function getUpdatedResources() {
		serviceApi.getResources(app.cache.data.CurrentOrder.orderDetail.orderId, app.cache.data.CurrentOrder.offeringEvent.offeringId)
		.done(function (response) {
			//update the resources collection in the current event
			app.cache.data.CurrentOrder.resources = response.payload;
			cache.updateEvent(app.cache.data.CurrentOrder);
			app.main.dataPollingDx.resourcesUpdated(moment());
		})
		.fail(function () {
			app.log('updated resources failed to download');

		});
	}

	function getUpdatedOrderSessions() {
		serviceApi.getOrderSessions(app.cache.data.CurrentOrder.orderDetail.orderId)
		.done(function (response) {
			//update the user sessions collection in the current event
			app.cache.data.CurrentOrder.orderDetail.userSessionIds = response.payload.userSessionIds;
			app.cache.data.CurrentOrder.orderDetail.enrollmentId = response.payload.enrollmentId;
			app.cache.data.CurrentOrder.orderDetail.serverTimestamp = response.payload.serverTimestamp;
			cache.updateEvent(app.cache.data.CurrentOrder);
			app.main.dataPollingDx.orderSessionsUpdated(moment());
		})
		.fail(function () {
			app.log('updated user sessions failed to download');
		});
	}

	function getUpdatedFeatures() {
		serviceApi.getFeatures(app.cache.data.CurrentOrder.orderDetail.orderId, app.cache.data.CurrentOrder.offeringEvent.offeringId)
		.done(function (response) {
			//update features collection
			app.cache.data.CurrentOrder.features = response.payload;
			cache.updateEvent(app.cache.data.CurrentOrder);
			app.main.dataPollingDx.featuresUpdated(moment());
			amplify.publish(app.events.dataUpdates.features);
		})
		.fail(function () {
			app.log('updated features failed to download');
		});
	}

	//returns the current announcements collection
	function getCurrentAnnouncements() {
		return currentAnnouncements;
	}

	//builds the current announcements collection from the announcements collection 
	//based on a 'current' time window and marks new announcements
	function refreshCurrentAnnouncementsFromOrder(order) {

		app.main.dataPollingDx.currentAnnouncementsUpdated(moment());

		var nextAnnouncements = calculateCurrentAnnouncements(order);
		var newCurrentAnnouncements;

		//compare previous set of current announcements to the new ones
		if (currentAnnouncements().length > 0) {
			newCurrentAnnouncements = $.map(nextAnnouncements, function (nextAnnouncement, i) {
				nextAnnouncement.isNew = isAnnouncementNew(nextAnnouncement, currentAnnouncements());
				nextAnnouncement.start = moment(nextAnnouncement.startDate).format("ddd h:m A");
				nextAnnouncement.end = moment(nextAnnouncement.endDate).format("h:m A");
				return nextAnnouncement;
			});
		}
			//no previous announcements
		else {
			//all announcemments are new
			newCurrentAnnouncements = $.map(nextAnnouncements, function (session, i) {
				session.isNew = true;
				session.start = moment(session.startDate).calendar();
				session.end = moment(session.endDate).format("h:m A");
				return session;
			});
		}
		currentAnnouncements.removeAll();
		ko.utils.arrayPushAll(currentAnnouncements, newCurrentAnnouncements);
		currentAnnouncements.valueHasMutated();
		return;
	}

	//based on current time and order time window - determine the announcements that are considered current
	function calculateCurrentAnnouncements(order) {

		var currentMoment = app.deviceClock.moment();

		var currentTimeWindow = {
			start: currentMoment.clone().add(order.announcements.viewWindowStartDateAdjustmentMinutes, 'minutes'),
			end: currentMoment.clone().add(order.announcements.viewWindowEndDateAdjustmentMinutes, 'minutes')
		};

		//find announcements that fall within the current window
		var nextAnnouncements = $.grep(order.announcements.sessions, function (session) {
			return moment(session.startDate) <= currentTimeWindow.end && moment(session.endDate) >= currentTimeWindow.start;
		});

		return nextAnnouncements;
	}

	//helper function to determine if an announcement is new to the user
	function isAnnouncementNew(nextAnnouncement, currentAnnouncements) {

		var foundAndNew = $.grep(currentAnnouncements, function (session, i) {
			//session in both arrays and it is marked as new in the current array
			return (session.id === nextAnnouncement.id && session.isNew);
		}).length > 0;

		var notFound = $.grep(currentAnnouncements, function (session, i) {
			//session in both arrays
			return (session.id === nextAnnouncement.id);
		}).length === 0;

		return foundAndNew || notFound;
	};

	//helper function for computed observable that keeps track of the new announcements in the current announcements collection
	function calculateNewAnnouncementCount() {
		var count = 0;
		if (currentAnnouncements) {
			count = $.grep(currentAnnouncements(), function (announcement) {
				return announcement.isNew;
			}).length;
		}
		return count;
	}

	//helper function for computed observable that gets the nearest announcement
	function calculateTopAnnouncement() {
		var now = new Date();
		if (currentAnnouncements().length > 0) {
			//get future announcements
			var future = $.grep(currentAnnouncements(), function (announcement) {
				return app.deviceClock.moment().isBefore(announcement.startDate);
			});
			//return first future announcement
			if (future.length > 0) {
				return future[0];
			}
				//return first announcement
			else {
				return currentAnnouncements()[0];
			}
		}
		else {
			return { title: 'No announcements yet', description: 'Latest announcement will appear as the event gets closer', start: '', end: '' };
		}
		return null;
	}

	//get latest tweets
	function getTweets() {

		var dfd = deferred();
		var order = app.cache.data.CurrentOrder;

		serviceApi.getTweets(order.orderDetail.orderId, order.offeringEvent.offeringId)
		.done(function (response) {
			var tweets = response.payload;
			dfd.resolve(tweets);

			//update local copy and cache
			app.cache.data.CurrentOrder.tweets = tweets;
			cache.updateEvent(app.cache.data.CurrentOrder);
			app.main.dataPollingDx.tweetsUpdated(moment());
			updateTopTweetFromOrder();//keep the tweet list and top tweet in sync
		})
		.fail(function (hxr) {
			dfd.reject(hxr);
		});

		return dfd.promise();
	};

	//get latest tweet from server and update the observable
	function refreshTopTweetFromServer() {
		//get top tweet
		var order = app.cache.data.CurrentOrder;

		serviceApi.getTopTweet(order.orderDetail.orderId, order.offeringEvent.offeringId)
		.done(function (topTweetResponse) {
			if (topTweetResponse.errorCode === 0) {
				topTweet(topTweetResponse.payload);
			}
		})
		.fail(function (xhr) {
			//try and get first cached tweet
			updateTopTweetFromOrder();
		});
	};

	function getEvents() {
		return cache.data.Events.get();
	}

	function getPresenter(userGuid) {

		var order = app.cache.data.CurrentOrder;
		try {
			var presenter = $.grep(order.offeringEvent.presenters, function (presenter) { return presenter.userGuid === userGuid; })[0];
			if (!presenter) {
				throw (null);
			}
			return JSON.parse(JSON.stringify(presenter));//deep copy the object - avoids persist to local storage circular reference issue due to lazy loaded collections
		}
		catch (e) {
			throw ('presenter not found userGUID: ' + userGuid);
		}
	};

	function getSession(sessionId) {

		var order = app.cache.data.CurrentOrder;
		try {
			var session = $.grep(order.offeringEvent.sessions, function (session) { return session.id === sessionId; })[0];
			if (!session) {
				throw (null);
			}
			return JSON.parse(JSON.stringify(session));//deep copy the object - avoids persist to local storage circular reference issue due to lazy loaded collections
		}
		catch (e) {
			throw ("failed while retrieving session from local collection. sessionID: " + sessionId);
		}
	};

	function getSessionTitle(sessionId, sessions) {
		try {
			var session = $.grep(sessions, function (session) { return session.id === sessionId; })[0];
			if (!session) {
				return "No Session Title for Session " + sessionId;
			}
			return session.title;
		}
		catch (e) {
			throw ("failed while retrieving session from local collection. sessionID: " + sessionId);
		}
	}

	function getResources() {
		var order = app.cache.data.CurrentOrder;
		try {

			var resources = order.resources.resources;
			return resources;
		}
		catch (e) {
			app.error.log(e, "getResources:Failed while retrieving resources from current order");
			return [];
		}
	};

	function getPresenters() {
		var order = app.cache.data.CurrentOrder;
		try {

			var presenters = order.offeringEvent.presenters;
			return presenters;
		}
		catch (e) {
			app.error.log(e, "getPresenters:Failed while retrieving presenters from current order");
			return [];
		}
	}

	function getRoom(roomId) {
		var order = app.cache.data.CurrentOrder;
		try {
			var room = $.grep(order.offeringEvent.map.rooms, function (room) { return room.id === roomId; })[0];
			if (!room) {
				throw (null);
			}

			return room;
		}
		catch (e) {
			throw ('room not found roomId: ' + roomId);
		}
	};

	function getCluster(clusterId) {
		var order = app.cache.data.CurrentOrder;
		try {
			var cluster = $.grep(order.offeringEvent.map.clusters, function (cluster) { return cluster.id === clusterId; })[0];
			if (!cluster) {
				throw (null);
			}

			return cluster;
		}
		catch (e) {
			throw ('cluster not found clusterId: ' + clusterId);
		}
	}

	function getSessionType(id) {

		var order = app.cache.data.CurrentOrder;
		var sessionType = $.grep(order.offeringEvent.sessionTypes, function (sessionType) { return sessionType.id === id; })[0];
		if (!sessionType) {
			sessionType = { 'id': '-1', 'title': 'no session type', 'color': '#ffffff' };
		}
		return sessionType;
	};

	function getSessionStyle(id) {

		var order = app.cache.data.CurrentOrder;
		var sessionStyle = $.grep(order.offeringEvent.learningTypes, function (type) { return type.learningTypeId === id; })[0];
		if (!sessionStyle) {
			sessionStyle = { 'learningTypeId': -1, 'title': 'no learning type with id ' + id, iconDataUri: '' };
		}
		return sessionStyle;
	};

	function getCredit(creditTypeId) {

		var order = app.cache.data.CurrentOrder;
		try {
			var credit = $.grep(order.offeringEvent.creditTypes, function (creditType) { return creditType.id === creditTypeId; })[0];
			if (!credit) {
				throw (null);
			}

			return credit;
		}
		catch (e) {
			throw ('credit type not found. creditTypeId: ' + creditTypeId);
		}

	};

	function getSponsorTypes() {
		var order = app.cache.data.CurrentOrder;
		try {

			return order.offeringEvent.sponsorTypes;
		}
		catch (e) {
			throw ('sponsor types not found');
		}
	};

	function getSponsorsByType(sponsorTypeId) {
		var order = app.cache.data.CurrentOrder;
		try {
			var sponsors = $.grep(order.offeringEvent.exhibitors, function (exhibitor) { return exhibitor.sponsorId === sponsorTypeId; });
			return sponsors;
		}
		catch (e) {
			throw ('sponsors not found sponsorTypeId: ' + sponsorTypeId);
		}
	}

	function getExhibitor(exhibitorId) {

		var order = app.cache.data.CurrentOrder;

		try {
			var exhibitor = $.grep(order.offeringEvent.exhibitors, function (exhibitor) { return exhibitor.id === exhibitorId; })[0];
			if (!exhibitor) {
				throw (null);
			}

			return exhibitor;
		}
		catch (e) {
			throw ('exhibitor not found. exhibitorID: ' + exhibitorId);
		}
	};

	function getDefaultNotes() {
		return { lastSuccessfulUpload: new Date('12/31/1900'), notes: [] };
	}

	function getNotesData() {

		if (app.cache.data.CurrentOrder === undefined) {
			var dfd = deferred();
			dfd.resolve(getDefaultNotes());
			return dfd.promise();
		}

		return cache.data.CurrentOrderNotes.get();
	};

	function updateNotesLastSuccessfulUpload(updatedDate, notesData) {
		notesData.lastSuccessfulUpload = updatedDate;
		cache.data.CurrentOrderNotes.set(notesData);
	};

	//get notes that have been edited since last successful upload
	function getUpdatedNotes() {
		return getNotesData().then(function (notesData) {
			var editedNotes = notesData.notes.filter(function(note) {
				return note.lastUpdatedDate > notesData.lastSuccessfulUpload;
			});
			return editedNotes;
		});
	};

	function getSessionNote(sessionId) {
		return getNotesData().then(function(notesData) {
			var note = $.grep(notesData.notes, function (note) { return note.sessionId === sessionId; })[0];

			//note not found - create new one
			if (!note) {
				var session = getSession(sessionId);
				var title = session.code + ': ' + session.title;
				var noteDate = new Date();
				note = { 'sessionId': sessionId, 'note': '', 'title': title, 'createdDate': noteDate, 'lastUpdatedDate': noteDate };
			}

			return note;
		});
	}

	function saveSessionNote(noteToSave) {
		return getNotesData().then(function(notesData) {
			var note = $.grep(notesData.notes, function (note) { return note.sessionId === noteToSave.sessionId; })[0];
			if (note) {
				//replace the value
				notesData.notes[notesData.notes.indexOf(note)] = noteToSave;
			}
			else {
				//insert new one
				notesData.notes.push(noteToSave);
			}

			//save notes array back to ls
			return cache.data.CurrentOrderNotes.set(notesData);
		});
	};

	function saveSessionNotesToServer() {
		var dfd = deferred();
		getUpdatedNotes().then(function(updatedNotes) {
			//replace '&#' in the notes and delete session title property to ensure '&#' is not send to server - CORS freaks out
			var notesToSave = $.map(updatedNotes, function (note, i) {
				delete note['title'];
				note.note = note.note.replace('&#', '');
				return note;
			});

			app.log('checking for updated notes');

			if (notesToSave.length > 0) {
				app.log('attempting to save updated notes to server');

				serviceApi.saveNotesToServer(app.cache.data.CurrentOrder.orderDetail.orderId, app.cache.data.CurrentOrder.orderDetail.offeringId, notesToSave)
				.done(function (response) {
					getNotesData().then(function(notesData) {
						updateNotesLastSuccessfulUpload(new Date(), notesData);
					});
					app.log('successfully save updated notes to server ' + notesToSave.length);
					dfd.resolve(response);
				})
				.fail(function (xhr) {
					app.error.log(null, "saveSessionNotesToServer:Failed to save updated notes to server " + notesToSave.length);
					dfd.reject(xhr);
				})
				.progress(function (progressState) {
					dfd.notify(progressState);
				});
			}
			else {
				app.log('no updated notes to upload to server');
				var response = { errorCode: 0 };
				dfd.resolve(response);
			}
		});
		return dfd.promise();
	};
	
	//need to make sure a cached order has correct structure
	// - learningTypes added for 2014 Forum
	//check for other required changes as they are implemented in api
	function ensureOrderStructureCorrect(order) {
		if (!order.offeringEvent.hasOwnProperty('learningTypes')) {
			order.offeringEvent.learningTypes = [];
		}
		return order;
	}

	function getOrder(orderId) {

		var dfd = deferred();

		lookupOrder(orderId)
			.then(function(order) {
				if (order !== null) {
					dfd.resolve(order);//cached order
				}
				else {
					//call service api
					serviceApi.getOrder(orderId)
						.done(function (response) {
							var order = response.payload;
							try {
								addOrderToStores(order);
							}
							catch (e) {
								dfd.fail(e, "addOrderToStores:failed when adding order to stores for order " + orderId, "repository.js");
							}
							dfd.resolve(order);
						})
						.fail(function (xhr) {
							app.error.log(null, "getOrder:failed when calling serviceApi.getOrder for order " + orderId, "repository.js");
							dfd.reject(xhr);
						})
						.progress(function (progressState) {
							dfd.notify(progressState);
						});
				}
			});
		return dfd.promise();
	}

	function refreshOrder(orderId) {
		var dfd = deferred();

		serviceApi.getOrder(orderId)
		.done(function (response) {
			var order = response.payload;
			dfd.resolve(order);

			//update local copy of notes from server copy of notes
			updateNotesForExistingOrder(order);

			//update local copy of order and cache
			app.cache.data.CurrentOrder = order;
			amplify.publish(app.events.appState.orderHasChanged, order);
			buildUserSessionsCollection(order);
			cache.updateEvent(app.cache.data.CurrentOrder);
			setDataDxValues(order);
		})
		.fail(function (xhr) {
			dfd.reject(xhr);
		})
		.progress(function (progressState) {
			dfd.notify(progressState);
		});
		return dfd.promise();
	}

	function updateNotesForExistingOrder(order) {

		var serverNotes = order.orderDetail.userSessionNotes.notes ? order.orderDetail.userSessionNotes.notes : [];

		//notes exist in order from server
		if (serverNotes.length > 0) {

			serverNotes = addSessionTitlesToNotes(serverNotes, order.offeringEvent.sessions);
			getNotesData().then(function (localNotesData) {

				//No notes exist in local storage for current order
				if (localNotesData.notes.length === 0) {
					//save all notes from order to local storage
					var orderNotes = transformNotesFromServer(serverNotes, order.offeringEvent.sessions);
					cache.data.CurrentOrderNotes.set(orderNotes);
				}
					//note exist in local storage - need to resolve each note's update status
				else {

					//notes in order but not in local - insert all locally
					var serverOnlyNotes = serverNotes.filter(function (serverNote) {
						return localNotesData.notes.filter(function (localNote) {
							return serverNote.sessionId === localNote.sessionId;
						}).length === 0;
					});

					//insert note
					serverOnlyNotes.forEach(function (note) { localNotesData.notes.push(note); });

					//local notes older than server - update locally
					var serverYoungerNotes = serverNotes.filter(function (serverNote) {
						return localNotesData.notes.filter(function (localNote) {
							return serverNote.sessionId === localNote.sessionId && serverNote.lastUpdatedDate > localNote.lastUpdatedDate;
						}).length === 1;
					});

					//replace note
					serverYoungerNotes.forEach(function (note) { localNotesData.notes[localNotesData.notes.indexOf(note)] = note; });

					//some notes have been updated and/or inserted - save locally
					if (serverOnlyNotes.length > 0 || serverYoungerNotes > 0) {
						cache.data.CurrentOrderNotes.set(localNotesData);
					}

					//all other notes will be notes that exist in the order but their local versions are younger - do nothing
				}
			});
			
			// do we need to set lastsuccessfulnoteupload date to something
			// current date would work for all notes updated from server but what about 
			// updated local notes not synced with the server yet
			// the scenario of the server having newer notes is unlikely - should only happen if mulitple devices being used
			// if we leave the last upload date alone the sync process will update it once it runs
		}
		//no server notes
		else {
			//do nothing - notes updating process will take care of updating server
		}
	}

	function buildUserSessionsCollection(order) {
		var userSessionIds = order.orderDetail.userSessionIds;
		order.userSessions = [];//add user sessions collection to order

		if (userSessionIds.length > 0) {
			var foundSession = null;

			for (var i = 0; i < userSessionIds.length; i++) {
				foundSession = getSession(userSessionIds[i]);
				if (foundSession) {
					order.userSessions.push(foundSession);
				}
			}
		}
	}

	function lookupOrder(orderId) {
		orderId = parseInt(orderId);
		return cache.data.Events.get()
			.then(function(events) {
				var order = $.grep(events, function (ev) { return ev.orderDetail.orderId === orderId; })[0] || null;
				if (order !== null) {
					order = ensureOrderStructureCorrect(order);
				}
				return order;
			})
			.fail(function(error) {
				app.error.log(error, "lookupOrder:failed to lookup order " + orderId, "repository.js");
			});
	}

	function setCurrentOrder(order) {
		if (order) {
			app.cache.data.CurrentOrder = order;

			cache.data.CurrentOrderId.set(order.orderDetail.orderId);

			updateTopTweetFromOrder();

			amplify.publish(app.events.appState.orderHasChanged, order);

			refreshCurrentAnnouncementsFromOrder(order);

			buildUserSessionsCollection(order);

			startPolling();

			setDataDxValues(order);
		}
		else {
			stopPolling();
			cache.data.CurrentOrderId.remove();
			app.cache.data.CurrentOrder = null;
		}
	}

	function startPolling() {
		stopPolling();
		initializeRightNowPolling();
		initializeUpdatedDataPolling();
		initializeNotesUploadPolling();
	}

	//delete an order from the cache and set app state to null
	function deleteLocalOrder(orderId) {
		stopPolling();
		app.cache.data.CurrentOrder = null;
		cache.data.CurrentOrderId.remove();
		cache.deleteEvent(orderId);
		cache.data.CurrentOrderNotes.remove();
	}

	function setDataDxValues(order) {
		app.main.dataPollingDx.eventUpdated(moment(order.offeringEvent.serverTimestamp));
		app.main.dataPollingDx.orderSessionsUpdated(moment(order.orderDetail.serverTimestamp));
		app.main.dataPollingDx.announcementsUpdated(moment(order.announcements.serverTimestamp));
		app.main.dataPollingDx.materialsUpdated(moment(order.materials.serverTimestamp));
		app.main.dataPollingDx.resourcesUpdated(moment(order.resources.serverTimestamp));
		app.main.dataPollingDx.featuresUpdated(moment(order.features.serverTimestamp));
	}

	//set top tweet to the first tweet contained in the order
	function updateTopTweetFromOrder() {
		if (app.cache.data.CurrentOrder.tweets.statuses.length > 0) {
			topTweet(app.cache.data.CurrentOrder.tweets.statuses[0]);
		}
	};

	function setHideHelp(option) {
		cache.data.HideHelp.set(option);
	};

	function setHideSwipeHelp(option) {
		cache.data.HideSwipeHelp.set(option);
	};

	function setHideNoteHelp(option) {
		cache.data.HideNoteHelp.set(option);
	};

	function setHideMapHelp(option) {
		cache.data.HideMapHelp.set(option);
	};

	function setHideProgramHelp(option) {
		cache.data.HideProgramHelp.set(option);
	};

	function setHideSessionHelp(option) {
		cache.data.HideSessionHelp.set(option);
	};

	function setPlayBackSound(option) {
		cache.data.PlayBackSound.set(option);
	}

	function addOrderToStores(order) {
		var notesFromServer = order.orderDetail.userSessionNotes.notes;
		cache.addEvent(order); //persist order to ls

		var orderNotes = transformNotesFromServer(notesFromServer, order.offeringEvent.sessions);
		cache.data.CurrentOrderNotes.set(orderNotes);
	}

	//wrap server notes in orderNotes object
	function transformNotesFromServer(notes, sessions) {

		var notesWithTitles = addSessionTitlesToNotes(notes, sessions);
		var orderNotes = { lastSuccessfulUpload: new Date(), notes: notesWithTitles };
		return orderNotes;
	}

	//add session titles to notes
	function addSessionTitlesToNotes(notes, sessions) {
		var notesWithTitles = $.map(notes, function (note) {
			note.title = getSessionTitle(note.sessionId, sessions);
			return note;
		});
		return notesWithTitles;
	}

	//force a refresh
	function refreshOfflineData() {
		var dfd = new deferred();
		return dfd.promise();
	}

	//helper function to load collection 
	function loadObsCollection(collectionToPopulate, data) {
		collectionToPopulate.removeAll();
		for (var item in data) {
			collectionToPopulate.push(data[item]);
		}
	}

})(jQuery.Deferred, app.cache, app.serviceApi, app.eventsMobileSettings);


