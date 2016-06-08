app.viewModelBuilder = (function(deferred, cache, repository, settings) {

	app.log("loading viewModelBuilder.js");

	var initializedDeferred = deferred(),
			searchViewModel = null,
	    mainMenuViewModel = null,
	    programViewModel = null;

	//current order changed, clear cached viewmodels
	amplify.subscribe(app.events.appState.orderHasChanged,
		function() {
			clearCachedViewModels();
		});

	//features changed for the current order - clear cached main menu vm
	amplify.subscribe(app.events.dataUpdates.features,
		function() {
			clearCachedMainMenuViewModel();
		});

	var builder = {
		initialized: initializedDeferred.promise(),
		getIndexViewModel: getIndexViewModel,
		getEventListViewModel: getEventListViewModel,
		getHomeViewModel: getHomeViewModel,
		getAnnouncementsViewModel: getAnnouncementsViewModel,
		getMyScheduleViewModel: getMyScheduleViewModel,
		getSessionViewModel: getSessionViewModel,
		getPresenterViewModel: getPresenterViewModel,
		getPresentersViewModel: getPresentersViewModel,
		getResourcesViewModel: getResourcesViewModel,
		getResourceListViewModel: getResourceListViewModel,
		getResourceViewModel: getResourceViewModel,
		getMapViewModel: getMapViewModel,
		getExhibitorsViewModel: getExhibitorsViewModel,
		getExhibitorViewModel: getExhibitorViewModel,
		getFeedbackViewModel: getFeedbackViewModel,
		getNotesViewModel: getNotesViewModel,
		getNoteViewModel: getNoteViewModel,
		getNotesUploadViewModel: getNotesUploadViewModel,
		getTwitterViewModel: getTwitterViewModel,
		getOptionsViewModel: getOptionsViewModel,
		getProgramViewModel: getProgramViewModel,
		getSearchViewModel: getSearchViewModel,
		getMenuViewModel: getMenuViewModel,
		getEventUpdateViewModel: getEventUpdateViewModel,
		getEventDeleteViewModel: getEventDeleteViewModel,
		getAboutViewModel: getAboutViewModel,
		getVenueViewModel: getVenueViewModel,
		getAppUpdateViewModel: getAppUpdateViewModel
	};

	function getIndexViewModel() {
		return new app.viewModels.indexViewModel(repository);
	}

	function getEventListViewModel() {
		return new app.viewModels.eventListViewModel(repository);
	}

	function getEventUpdateViewModel() {
		return new app.viewModels.eventUpdateViewModel(repository, app.cache.data.CurrentOrder);
	}

	function getEventDeleteViewModel() {
		var dfd = deferred();
		var vm = new app.viewModels.eventDeleteViewModel(repository, app.cache.data.CurrentOrder);

		var promise1 = repository.getNotesData().then(function (notes) {
			vm.notesExist = notes.length > 0;
		});
		var promise2 = repository.getUpdatedNotes().then(function (notes) {
			vm.numberOfEditedNotes = notes.length;
			vm.notesMessage = self.numberOfEditedNotes > 1 ? 'notes' : 'note';
		});

		$.when(promise1, promise2)
			.done(dfd.resolve(vm))
			.fail(e => app.error.log(e, "getEventDeleteViewModel", "viewModelBuild.js"));
		return dfd.promise();
	}

	function getHomeViewModel() {
		app.log("viewModelBuild.js:getHomeViewModel");
		var vm = new app.viewModels.homeViewModel(repository);
		return vm;
	}

	function getAppUpdateViewModel() {
		var vm = new app.viewModels.appUpdateViewModel();
		return vm;
	}

	function getAnnouncementsViewModel() {
		app.log("viewModelBuild.js:getAnnouncementsViewModel");
		var vm = new app.viewModels.announcementsViewModel();
		vm.announcements = repository.getCurrentAnnouncements();
		vm.newAnnouncementCount = repository.getNewAnnouncementCount(); //get computed observable
		vm.sponsorUrl = app.cache.data.CurrentOrder.offeringEvent.branding.appSponsorUrl;
		vm.showAppSponsor = app.cache.data.CurrentOrder.offeringEvent.branding.appSponsorLogo;
		return vm;
	}

	function getMyScheduleViewModel() {

		var vm = new app.viewModels.myScheduleViewModel();

		var order = app.cache.data.CurrentOrder;
		var userSessionIds = order.orderDetail.userSessionIds;

		if (userSessionIds && userSessionIds.length > 0) {

			//build days structure
			var currentDate = new Date(0),
			    currentStart = new Date(0),
			    currentEnd = new Date(0),
			    currentDay = null,
			    currentTime = null,
			    currentTitle = null,
			    currentSession = null,
			    currentType = -1,
			    schedule = [];
			for (var i = 0; i < order.userSessions.length; i++) {
				currentSession = order.userSessions[i];
				if (moment(currentSession.startDate).isAfter(currentDate, 'day')) {
					currentDate = currentSession.startDate;
					currentDay = { "day": moment(currentDate).format("ddd MMM DD"), "times": [] };
					schedule.push(currentDay);
				}

				if (moment(currentSession.startDate).isAfter(currentStart, 'time') ||
					moment(currentSession.endDate).isAfter(currentEnd, 'time') ||
					currentSession.sessionTypeId !== currentType) {
					currentTitle = getScheduleTitle(currentSession);
					currentType = currentSession.sessionTypeId;
					currentStart = currentSession.startDate;
					currentEnd = currentSession.endDate;
					currentTime = {
						"time": moment(currentSession.startDate).format("h:mm a") +
							" - " +
							moment(currentSession.endDate).format("h:mm a"),
						"title": currentTitle,
						"sessions": []
					};
					currentDay.times.push(currentTime);
				}

				var item = {
					"id": currentSession.id,
					"type": repository.getSessionType(currentSession.sessionTypeId),
					"title": currentSession.code + ": " + currentSession.title,
					"room": currentSession.room.roomId
						? repository.getCluster(currentSession.room.clusterId).name +
						": " +
						repository.getRoom(currentSession.room.roomId).name
						: "no room"
				};
				currentTime.sessions.push(item);
			}

			vm.schedule = schedule;

		}
		return vm;
	}

	function getSessionViewModel(sessionId) {
		app.log("viewModelBuild.js:getSessionViewModel");

		var updateFunction = function(item) {
			var self = this;
			var foundSession = repository.getSession(item.id);
			foundSession.presenters = [];
			foundSession.creditTypes = [];
			foundSession.materials = [];

			self.scrollToTop = function() {
				$('html, body').animate({ scrollTop: $("#session").offset().top }, 0);
			};
			//add roomName property to session if it hasn't already been added to this instance
			if (!foundSession.hasOwnProperty('roomName')) {

				foundSession.roomName = '';
				foundSession.isRoomLocationLinkable = false;

				if (foundSession.room.roomId) {
					var room = repository.getRoom(foundSession.room.roomId);
					var cluster = repository.getCluster(foundSession.room.clusterId);
					var mapDataUriIsNotNull = (app.cache.data.CurrentOrder.offeringEvent.map.dataUri !== null);

					foundSession.roomName = cluster.name + ": " + room.name;

					foundSession.isRoomLocationLinkable = (
						mapDataUriIsNotNull &&
							room.x !== null &&
							room.y !== null &&
							cluster.height !== null &&
							cluster.width !== null &&
							cluster.top !== null &&
							cluster.left !== null
					);
				}
			}

			//get presenters for the session
			var presenter, i;
			for (i = 0; i < foundSession.presenterGuids.length; i++) {
				presenter = repository.getPresenter(foundSession.presenterGuids[i]);
				foundSession.presenters.push(presenter);
			}

			//get credits for the session
			var credit;
			for (i = 0; i < foundSession.credits.length; i++) {
				credit = repository.getCredit(foundSession.credits[i].creditTypeId);
				credit.hours = foundSession.credits[i].hours;
				foundSession.creditTypes.push(credit);
			}

			//get learning type/style
			foundSession.sessionStyle = repository.getSessionStyle(foundSession.learningTypeId);

			//get session type color
			foundSession.sessionTypeColor = repository.getSessionType(foundSession.sessionTypeId).color;

			//get materials
			foundSession.materials = $.grep(app.cache.data.CurrentOrder.materials.materials,
				function(val) { return val.sessionId === foundSession.id; });

			//session not set yet
			if (self.session == null) {
				self.session = ko.mapping.fromJS(foundSession);
				self.time = ko.computed(function() {
					return moment(self.session.startDate()).format("ddd h:mm a") +
						' - ' +
						moment(self.session.endDate()).format("h:mm a");
				});
				self.shortDescription = ko.computed(function() {
					return self.session.description() ? self.session.description().substring(0, 200) : "";
				});
				self.moreDescription = ko.computed(function() {
					return self.session.description() ? self.session.description().substring(200) : "";
				});

				self.hasObjectives = ko.computed(function() {
					return self.session.objectives() && self.session.objectives().length > 0;
				});
				self.hasPresenters = ko.computed(function() {
					return self.session.presenters() && self.session.presenters().length > 0;
				});
				self.hasHandouts = ko.computed(function() {
					 return self.session.materials && self.session.materials().length > 0;
				});
				self.hasCredits = ko.computed(function() {
					return self.session.creditTypes() && self.session.creditTypes().length > 0;
				});
				self.noteImage = ko.computed(function () {
					return repository.getSessionNote(self.session.id())
						.then(function (data) {
							return (data && data.note && (data.note.length > 0)) ? "edithighlight.png" : "edit.png";
						}, function (e) {
							app.error.log(e, "getSessionViewModel:completed notImage computation", "viewModelBuilder.js");
							return "edit.png";
						});
				}).extend({ async: "edit.png" });
				self.isMapAvailable = ko.computed(function() {
					return (self.session && self.session.room.clusterId() !== undefined && self.session.room.clusterId() !== null);
				});

				self.handoutsStatus = ko
					.computed(function() { return self.hasHandouts() ? "native-anchor" : "actionIconDisabled"; });
				self.handoutsAnchor = ko.computed(function() { return self.hasHandouts() ? "materialAnchor" : "#"; });
			}
			//session needs to be updated
			else {
				ko.mapping.fromJS(foundSession, self.session);
			}

			app.analytics.sendPageView(app.analytics.pageViews.sessionDetail(self.session.code()));

			self.scrollToTop();
		};

		var vm = new app.viewModels.sessionViewModel(repository, updateFunction);
		vm.updater({ "id": sessionId });
		return vm;
	}

	function getPresenterViewModel(userGuid) {

		//function used to set/update view model
		var updateViewModel = function(item) {
			var self = this;
			var presenter = repository.getPresenter(item.id);
			presenter.sessions = [];

			self.scrollToTop = function() {
				$('html, body').animate({ scrollTop: $("#presenter").offset().top }, 0);
			};

			//get sessions
			var session;
			for (var i = 0; i < presenter.sessionIds.length; i++) {
				session = repository.getSession(presenter.sessionIds[i]);
				repository.ensureSessionHasTypeColor(session);
				presenter.sessions.push(session);
			}
			//presenter not set yet
			if (self.profile === null) {
				self.profile = ko.mapping.fromJS(presenter);
				self.shortBio = ko.computed(function() { return self.profile.bio() ? self.profile.bio().substring(0, 200) : ""; });
				self.moreBio = ko.computed(function() { return self.profile.bio() ? self.profile.bio().substring(200) : ""; });
			}
			//presenter needs to be updated
			else {
				ko.mapping.fromJS(presenter, self.profile);
			}

			app.analytics.sendPageView(app.analytics.pageViews.presenterDetail(self.profile.name()));

			self.scrollToTop();
		};

		var vm = new app.viewModels.presenterViewModel(updateViewModel);
		vm.updater({ "id": userGuid });
		return vm;
	}


	function getPresentersViewModel() {
		var vm = new app.viewModels.presentersViewModel();
		vm.presenters = repository.getPresenters();
		return vm;
	}

	function getResourcesViewModel() {
		var vm = new app.viewModels.resourcesViewModel();
		vm.resources = repository.getResources();
		return vm;
	}

	function getResourceViewModel() {
		return new app.viewModels.resourceViewModel();
	}

	function getResourceListViewModel() {
		return new app.viewModels.resourceListViewModel();
	};

	function getMapViewModel(roomId, sessionCode) {
		app.log("viewModelBuild.js:getMapViewModel");

		var vm = new app.viewModels.mapViewModel();
		var order = app.cache.data.CurrentOrder;

		vm.mapImageData = order.offeringEvent.map.dataUri;
		vm.sessionCode = sessionCode;

		//if a room is specified - get room and cluster coords and dimensions
		if (roomId) {
			var room = repository.getRoom(roomId);
			var cluster = repository.getCluster(room.clusterId);
			vm.mapRoomCoords = {
				clusterWidth: cluster.width,
				clusterHeight: cluster.height,
				clusterX: cluster.left,
				clusterY: cluster.top,
				roomCenterX: room.x,
				roomCenterY: room.y
			};
		}
		return vm;
	}

	function getExhibitorsViewModel() {

		var vm = new app.viewModels.exhibitorsViewModel();

		var types = repository.getSponsorTypes();
		var currentType;
		var exhibitorType = 4;

		//get sponsors
		for (var i = 0; i < types.length; i++) {
			currentType = types[i];
			if (currentType.id !== exhibitorType) {
				currentType.sponsors = repository.getSponsorsByType(currentType.id);
				vm.levels.push(currentType);
			}
		}

		//get exhibitors
		vm.exhibitors = repository.getSponsorsByType(exhibitorType);

		return vm;
	}

	function getExhibitorViewModel(exhibitorId) {

		var updateFunction = function(item) {

			var self = this;

			var exhibitor = repository.getExhibitor(item.id);

			//exhibitor not set yet
			if (self.exhibitor === null) {
				self.exhibitor = ko.mapping.fromJS(exhibitor);
			}
			//exhibitor needs to be updated
			else {
				ko.mapping.fromJS(exhibitor, self.exhibitor);
			}
			app.analytics.sendPageView(app.analytics.pageViews.exhibitorDetail(self.exhibitor.name()));
		};

		var vm = new app.viewModels.exhibitorViewModel(updateFunction);
		vm.updater({ "id": exhibitorId });
		return vm;
	}

	function getFeedbackViewModel() {

		var vm = new app.viewModels.feedbackViewModel(settings);
		vm.deviceInfo = app.main.deviceInfo; // model, cordova,platform,uuid,version

		return vm;
	}

	function getNotesViewModel() {
		var dfd = deferred();
		repository.getNotesData()
			.then(function (notesData) {
				var notes = app.Common.sortArray(notesData.notes, 'title');
				notes = notes.map(function (note) {
					note.isEdited = (note.lastUpdatedDate > notesData.lastSuccessfulUpload);
					return note;
				});
				var vm = new app.viewModels.notesViewModel();
				vm.notes = notes;
				return vm;
			})
			.then(function (vm) {
				repository.getUpdatedNotes()
					.then(function (updatedNotes) {
						vm.numberOfEditedNotes = updatedNotes.length;
						vm.notesMessage = vm.numberOfEditedNotes > 1 ? 'notes' : 'note';

						dfd.resolve(vm);
					}).fail(app.error.log);
			}).fail(app.error.log);
		return dfd.promise();
	}

	function getNotesUploadViewModel() {

		var vm = new app.viewModels.notesUploadViewModel();
		var order = app.cache.data.CurrentOrder;

		vm.fullName = order.orderDetail.fullName;
		vm.email = order.orderDetail.email;
		return vm;
	}

	function getNoteViewModel(sessionId) {
		return repository.getSessionNote(sessionId).then(function(sessionNote) {
			var note = ko.mapping.fromJS(sessionNote);
			var vm = new app.viewModels.noteViewModel(note);
			vm.isHelpHidden(app.main.currentState.hideNoteHelp);

			return vm;
		});
	};

	function getTwitterViewModel() {
		return new app.viewModels.twitterViewModel();
	};

	function getOptionsViewModel() {
		return new app.viewModels.optionsViewModel();
	};

	function getAboutViewModel() {
		var dfd = deferred();
		app.log("viewModelBuild.js:getAboutViewModel");
		var vm = new app.viewModels.aboutViewModel();

		var promiseGetErrors = cache.data.Errors.get().done(function (errors) {
			vm.errorLog = app.Common.sortArray(errors, 'timestamp', true);
		});

		var order = app.cache.data.CurrentOrder;
		var promiseGetNotes = null;
		if (order) {
			promiseGetNotes = repository.getNotesData()
				.then(function(notes) {
					vm.lastNotesUpload = moment(notes.lastSuccessfulUpload);
				})
			.fail(app.error.log);
			vm.dx = app.main.dataPollingDx;
			vm.eventName = order.offeringEvent.title;
			vm.attendeeName = order.orderDetail.fullName;
			vm.attendeeEmail = order.orderDetail.email;
			vm.orderId = order.orderDetail.orderId;
		}

		vm.hasOrder = order ? true : false;
		vm.version = app.eventsMobileSettings.appVersion;
		vm.deviceTime = moment();
		vm.dataHost = app.eventsMobileSettings.sslDomain;
		vm.deviceInfo = app.main.deviceInfo; // model, cordova,platform,uuid,version
		vm.queuedAnalyticsCount = app.analytics.getQueuedAnalyticsCount();

		$.when(promiseGetErrors, promiseGetNotes)
			.done(() => dfd.resolve(vm))
			.fail(dfd.reject);
		return dfd.promise();
	};

	function getVenueViewModel() {
		app.log("viewModelBuild.js:getVenueViewModel");
		var event = app.cache.data.CurrentOrder.offeringEvent;

		var vm = new app.viewModels.venueViewModel();

		vm.name(event.locationName);
		vm.address(event.locationAddress);
		vm.city(event.locationCity);
		vm.state(event.locationState);
		vm.country(event.locationCountry);
		vm.phone(event.locationPhone);
		vm.website(event.locationWebsite);

		return vm;
	};

	function getProgramViewModel() {
		app.log("viewModelBuild.js:getProgramViewModel");
		var updateFunction = function(item) {
			this.updateCurrentState(item.by, item.title);
		};

		if (programViewModel === null) {
			var vm = new app.viewModels.programViewModel(repository, updateFunction);

			//build up program structure - need to figure caching mechanism
			var program = {
				days: [],
				types: [],
				styles: [],
				tracks: [],
				sessions: []
			};

			var order = app.cache.data.CurrentOrder;

			//build up session types structure
			var sessionTypesFilter = function (session) {
				return (session.sessionTypeId === this.id && session.isPublicAgenda === true);
			};

			var sessionIdTransform = function (session) {
				return session.id;
			};

			var sessionsFilter = function(sessionType) {
				//load sessionIds for the session type
				sessionType.sessions = order.offeringEvent.sessions.filter(sessionTypesFilter, sessionType).map(sessionIdTransform);
				return sessionType;
			};

			var sessionTypesWithSessions = function(sessionType) {
				return sessionType.sessions.length > 0;
			};

			var sessionStylesFilter = function (session) {
				return (session.learningTypeId === this.learningTypeId && session.isPublicAgenda === true);
			};

			//build up learning types/style structure
			var stylesFilter = function(styleType) {
				//load sessionIds for the session style
				styleType.sessions = order.offeringEvent.sessions.filter(sessionStylesFilter, styleType).map(sessionIdTransform);
				return styleType;
			};

			var sessionStylesWithSessions = function(sessionStyle) {
				return sessionStyle.sessions.length > 0 && sessionStyle.learningTypeId !== 0;
			};

			//types
			program.types = $.grep(order.offeringEvent.sessionTypes.map(sessionsFilter), sessionTypesWithSessions);
			program.types = app.Common.sortArray(program.types, 'title');

			//styles
			program.styles = $.grep(order.offeringEvent.learningTypes.map(stylesFilter), sessionStylesWithSessions);
			program.styles = app.Common.sortArray(program.styles, 'title');


			//tracks
			program.tracks = $.grep(order.offeringEvent.tracks, function(track) { return track.sessionTypes.length > 0; });

			//sessions - only public agenda items
			program.sessions = $.grep(order.offeringEvent.sessions, function(session) { return session.isPublicAgenda; });

			//build day structure
			var currentDate = new Date(0);
			var currentStart = new Date(0);
			var currentEnd = new Date(0);

			var currentDay = null;
			var currentTime = null;

			var currentTitle = null;
			var currentSession = null;
			var currentType = -1;

			for (var i = 0; i < program.sessions.length; i++) {
				currentSession = program.sessions[i];
				if (moment(currentSession.startDate).isAfter(currentDate, 'day')) {
					currentDate = currentSession.startDate;
					currentDay = { "day": moment(currentDate).format("ddd MMM DD"), "times": [] };
					program.days.push(currentDay);
				}

				if (moment(currentSession.startDate).isAfter(currentStart, 'time') ||
					moment(currentSession.endDate).isAfter(currentEnd, 'time') ||
					currentSession.sessionTypeId !== currentType) {
					currentTitle = getScheduleTitle(currentSession);
					currentType = currentSession.sessionTypeId;
					currentStart = currentSession.startDate;
					currentEnd = currentSession.endDate;
					currentTime = {
						"time": moment(currentSession.startDate).format("h:mm a") +
							" - " +
							moment(currentSession.endDate).format("h:mm a"),
						"title": currentTitle,
						"typeColor": repository.getSessionType(currentSession.sessionTypeId).color,
						"sessions": []
					};
					currentDay.times.push(currentTime);
				}
				currentTime.sessions.push(currentSession.id);

			}
			vm.program = program;
			programViewModel = vm;
		}

		programViewModel.hideHelp(app.main.currentState
			.hideProgramHelp); //need to do this if it gets reset - this vm is cached
		programViewModel.hookupMasterElements(); //needed due to this viewmodel being cached

		return programViewModel;
	};

	function getScheduleTitle(session) {
		if (session.siblingSessionCount > 0) {
			return repository.getSessionType(session.sessionTypeId).title;
		} else {
			return session.title;
		}
	};

	function getSearchViewModel(pageViewModel) {
		app.log("viewModelBuild.js: getSearchViewModel");
		//singleton
		if (searchViewModel === null) {
			app.log("created new search viewmodel");

			searchViewModel = new app.viewModels.searchViewModel(pageViewModel);

			var order = app.cache.data.CurrentOrder;

			searchViewModel.data.sessions = $.grep(order.offeringEvent.sessions,
					function(session) {
						return !session.isGroup;
					})
				.map(function(session) {
					return {
						"id": session.id,
						"title": session.code + ': ' + session.title,
						"sessionTypeColor": repository.getSessionType(session.sessionTypeId).color
					};
				});

			searchViewModel.data.types = order.offeringEvent.sessionTypes.map(function(type) {
				return { "id": type.id, "title": type.title, "color": type.color };
			});

			searchViewModel.data.announcements = repository.getCurrentAnnouncements();

			searchViewModel.data.presenters = order.offeringEvent.presenters.map(function(presenter) {
				return { "id": presenter.userGuid, "name": presenter.name };
			});

			searchViewModel.data.exhibitors = order.offeringEvent.exhibitors.map(function(exhibitor) {
				return { "id": exhibitor.id, "name": exhibitor.name };
			});

			searchViewModel.data.tracks = order.offeringEvent.tracks.map(function(track) {
				return { "id": track.id, "title": track.name };
			});

			searchViewModel.data.styles = order.offeringEvent.learningTypes.map(function(style) {
				return { "id": style.learningTypeId, "title": style.title };
			});

			searchViewModel.data.features = order.features.mainMenu[0].map(function(menuItem) {
				return { "url": menuItem.url, "title": app.Common.toTitleCase(menuItem.title) };
			});

			searchViewModel.data.resources = order.resources.resources.map(function(resource) {
				return { "url": resource.url, "title": resource.title, "fileType": resource.fileType };
			});
		} else {
			searchViewModel.alreadyBound = false;
			searchViewModel.pageViewModel = pageViewModel;
			app.log("returned existing search viewmodel");
		}
		return searchViewModel;
	};

	function getMenuViewModel() {
		app.log("viewModelBuild.js:getMenuViewModel");
		//singleton
		if (mainMenuViewModel === null) {
			app.log("created new mainmenu viewmodel");
			var order = app.cache.data.CurrentOrder;
			var menuItems = order.features.mainMenu;
			var filteredItems;

			if (order) {
				//remove the menu items if the associated collection is empty
				if (order.offeringEvent.exhibitors && order.offeringEvent.exhibitors.length === 0) {
					filteredItems = $.grep(order.features.mainMenu[0],
						function(item) {
							return item.url !== "exhibitors.html";
						});
					menuItems[0] = filteredItems;
				}

				if (order.offeringEvent.presenters && order.offeringEvent.presenters.length === 0) {
					filteredItems = $.grep(order.features.mainMenu[0],
						function(item) {
							return item.url !== "presenters.html";
						});
					menuItems[0] = filteredItems;
				}


				if (order.resources.resources && order.resources.resources.length === 0) {
					filteredItems = $.grep(order.features.mainMenu[0],
						function(item) {
							return item.url !== "resources.html";
						});
					menuItems[0] = filteredItems;
				}

				mainMenuViewModel = new app.viewModels.mainMenuViewModel(menuItems);
			} else {
				throw "current order cannot be null";
			}
		} else {
			mainMenuViewModel.alreadyBound = false;
			app.log("returned existing mainmenu viewmodel");
		}
		return mainMenuViewModel;
	};

	function clearCachedViewModels() {
		mainMenuViewModel = null;
		searchViewModel = null;
		programViewModel = null;
		cache.data.ProgramState.remove();
	};

	function clearCachedMainMenuViewModel() {
		mainMenuViewModel = null;
	};

	function initializeBuilder() {
		repository.initialized
			.done(function () {
				app.log("viewModelBuild.js initialized");
				initializedDeferred.resolve();
			})
			.fail(function (e) {
				app.error.log(e, "initializeBuilder:failed to initialize builder", "viewModelBuild.js");
				initializedDeferred.reject(e);
			});
	};

	initializeBuilder();

	return builder;

})(jQuery.Deferred, app.cache, app.repository, app.eventsMobileSettings);
