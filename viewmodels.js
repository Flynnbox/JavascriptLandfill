/// <reference path="app-analytics.js" />
app.viewModels = (function (deferred, cache, repository) {

	app.log("loading viewmodels.js");

	var vms = {

		indexViewModel: indexViewModel,
		eventListViewModel: eventListViewModel,
		homeViewModel: homeViewModel,
		announcementsViewModel: announcementsViewModel,
		myScheduleViewModel: myScheduleViewModel,
		sessionViewModel: sessionViewModel,
		presenterViewModel: presenterViewModel,
		presentersViewModel: presentersViewModel,
		resourcesViewModel: resourcesViewModel,
		mapViewModel: mapViewModel,
		exhibitorsViewModel: exhibitorsViewModel,
		exhibitorViewModel: exhibitorViewModel,
		feedbackViewModel: feedbackViewModel,
		notesViewModel: notesViewModel,
		notesUploadViewModel: notesUploadViewModel,
		noteViewModel: noteViewModel,
		twitterViewModel: twitterViewModel,
		optionsViewModel: optionsViewModel,
		programViewModel: programViewModel,
		searchViewModel: searchViewModel,
		mainMenuViewModel: mainMenuViewModel,
		eventUpdateViewModel: eventUpdateViewModel,
		eventDeleteViewModel: eventDeleteViewModel,
		aboutViewModel: aboutViewModel,
		venueViewModel: venueViewModel,
		appUpdateViewModel: appUpdateViewModel
	};

	function appUpdateViewModel() {
		var self = this;
		self.isiOS = ko.observable(app.main.isiOS);
	};

	function indexViewModel(repository) {

		var self = this;
		self.repository = repository;
	};

	function eventListViewModel(repository) {
		var self = this;
		var dfd = deferred();

		self.initialized = dfd.promise();
		self.repository = repository;
		self.showAdd = ko.observable(true);
		self.showList = ko.observable(true);

		self.repository.getEvents()
			.done(function(events) {
				self.events = events;
				self.eventsExist = ko.computed(function () { return self.events.length > 0; });
				self.showMyEvents = ko.computed(function () { return self.eventsExist() && self.showList(); });
				self.showAdd(!self.eventsExist());
				dfd.resolve();
			})
			.fail(function(error) {
				app.error.log(error, "eventListViewModel:failed to retrieve events from repository", "viewmodel.js");
				dfd.reject();
			});

		self.foundEvent = ko.observable();
		self.foundFullName = ko.observable();
		self.showConfirm = ko.observable(false);

		self.isBusy = ko.observable(false);
		self.downloadProgress = ko.observable(0);

		self.orderId = ko.observable();
		self.username = ko.observable();

		self.getStarted = function () {
			self.showList(false);
			self.isBusy(false);
			self.showAdd(true);
		};

		self.scrollToTop = function () {
			$('html, body').animate({ scrollTop: $("#main").offset().top }, 0);
		};

		self.checkForUrlLaunch = function () {
			//handle launch url being passed into app - if contains orderid and username - populate the form
			app.cache.data.AppLaunchUrl.get().done(function(launchUrl) {
				app.log("viewmodel checkforurllaunch" + launchUrl);
				app.cache.data.AppLaunchUrl.remove();

				if (launchUrl) {
					try {
						var launchQueryString = launchUrl.replace("ihionsite://", "");
						app.log("viewmodel query string" + launchQueryString);
						if (launchQueryString) {
							var params = app.Common.splitQueryString(launchQueryString);
							if (params["orderid"] && params["username"]) {
								repository.loadOrderByOrderId(params["orderid"])
									.then(function(order) {
										//order already on the device
										if (order) {
											app.log("viewmodel order on device" + order);

											repository.setCurrentOrder(order);

											//NOTE: defer this to avoid issue on android when linking to ihionsite:// 
											//with an order number and home page not binding the viewmodel due to the
											// event pagebeforeshow event not firing or too early
											app.Common.defer(function() {
													navigateToEventHome();
												},
												100);
										}
										//display add event form
										else {
											app.log("viewmodel order not on device" + params["orderid"]);
											self.orderId(params["orderid"]);
											self.username(params["username"]);
											self.getStarted();
										}
									});
							}
						}
					} catch (e) {
						app.error.log(e, "checkForUrlLaunch: error occurred viewmodel checkforurllaunch");
					}
				} else {
					app.log("checkforurllaunch no url found");
				}
			}).fail(e => app.error.log(e, "checkForUrlLaunch: error occurred viewmodel checkforurllaunch"));
		};

		//used in case the app is lauched with url and eventlist.html is current page
		amplify.subscribe(app.events.appState.appLaunchedWithUrl, self.checkForUrlLaunch);

		self.verifyOrder = function () {
			var orderId = parseInt(self.orderId());
			if (orderId) {
				self.isBusy(true);
				self.showAdd(false);
				self.scrollToTop();

				self.repository.getOrder(parseInt(self.orderId()))
					.then(function (order) {
						self.isBusy(false);
						self.foundEvent(order.offeringEvent.title);
						self.foundFullName(order.orderDetail.fullName);

						return self.repository.setCurrentOrder(order)
							.then(function() {
								$('#eventList').listview('refresh');

								self.showConfirm(true);
								app.analytics.sendPageView(app.analytics.pageViews.addEventSuccess());
							});
					})
					.fail(function (response) {

						self.isBusy(false);
						self.showList(false);
						self.showAdd(true);

						if (response.errorCode === 400) {
					 		app.analytics.sendAppEvent(app.analytics.appEvents.addEventError('InvalidOrderNumber'));
					 		toastr.error("Sorry but your order number could not be validated. Please check it and try again.", "", { positionClass: "toast-bottom-full-width" });
						}
						else if (response.errorCode === 500) {
					 		app.analytics.sendAppEvent(app.analytics.appEvents.addEventError('ServerError'));
					 		toastr.error("Sorry an error has occurred while validating your order number.", "", { positionClass: "toast-bottom-full-width" });
						}
						else if (response === "local storage issue") {
					 		app.analytics.sendAppEvent(app.analytics.appEvents.addEventError('LocalStorageError'));
					 		toastr.error("Could not save your event to the device due to exceeding storage limits", "", { positionClass: "toast-bottom-full-width" });
						}
						else {
					 		toastr.error("Sorry an error has occurred", "", { positionClass: "toast-bottom-full-width" });
					 		var error = { 'message': response.errorCode + ' ' + response.errorDescription, 'url': 'verify order', 'line': '-', 'orderId': self.orderId() ? self.orderId() : -1, 'offeringId': -1 };
					 		amplify.publish(app.events.appState.errorOccurred, error);
					 		app.analytics.sendAppEvent(app.analytics.appEvents.addEventError('Error: ' + response.errorCode));
						}
						})
						.progress(function (progressState) {
						self.downloadProgress(progressState.progressPercent);
					});
			}
			else if (!orderId) {
				toastr.error("Password must be the 6-digit number on your badge, please check it and try again.", "", { positionClass: "toast-bottom-full-width" });
				app.analytics.sendAppEvent(app.analytics.appEvents.addEventError('MissingOrderId'));
			}
			else {
				toastr.error("Both username and password are required to add an event", "", { positionClass: "toast-bottom-full-width" });
				app.analytics.sendAppEvent(app.analytics.appEvents.addEventError('MissingOrderIdAndName'));
			}
		};

		self.selectEvent = function (event) {
			self.repository.loadOrderByOrderId(event.orderId)
				.then(self.repository.setCurrentOrder)
				.then(navigateToEventHome)
				.fail(error => app.error.log(error, "selectEvent", "viewmodels.js"));
			app.analytics.sendAppEvent(app.analytics.appEvents.selectEventFromList());
		};

		//called when taphold event is triggered on the event list
		self.confirmDeletetEvent = function (event) {
			navigator.notification.confirm("Are you sure you want to delete this event from your device?",
				deleteEventCallBack(event),
				"Delete Event",
				['Yes', 'No'],
				event);
		};

		var deleteEventCallBack = function (event) {
			return function (buttonIndex) {
				if (buttonIndex === 1) {
					self.repository.deleteLocalOrder(event.orderId);
					app.analytics.sendAppEvent(app.analytics.appEvents.deleteEventConfirm(event.eventCode));
					navigateToAppHome();
				}
				else {
					app.analytics.sendAppEvent(app.analytics.appEvents.deleteEventCancel(event.eventCode));
				}
			};
		};

		self.clearValues = function () {
			self.orderId(null);
			self.username(null);
			self.foundEvent(null);
			self.foundFullName(null);
		};

		self.letsGo = function () {
			navigateToEventHome();
			self.clearValues();
			self.showConfirm(false);
		};

		self.deleteEvent = function () {
			self.repository.deleteLocalOrder(parseInt(self.orderId()));

			self.showList(false);
			self.showConfirm(false);
			self.clearValues();
			self.showAdd(true);
		};

		self.cancelAdd = function () {
			self.scrollToTop();
			self.showList(true);
			self.showAdd(false);
			self.clearValues();
			app.analytics.sendAppEvent(app.analytics.appEvents.addEventCancel());
		};

		function navigateToAppHome() {

			var Backlen = window.history.length;
			window.history.go(-Backlen);
			window.location = "index.html";
		};

		function navigateToEventHome() {
			if ($.mobile.activePage[0] && $('.ui-page-active').data('url').indexOf('/home.html') === -1) {
				$.mobile.changePage("home.html", {
					transition: "fade",
					type: "get",
					changeHash: true
				});
			}
		};
	};

	function eventUpdateViewModel(repository, order) {

		var self = this;

		self.repository = repository;
		self.fullName = order.orderDetail.fullName;
		self.eventName = order.offeringEvent.title;
		self.showConfirm = ko.observable(false);

		self.isBusy = ko.observable(false);
		self.showUpdate = ko.observable(true);
		self.downloadProgress = ko.observable(0);

		self.updateEvent = function () {

			self.showUpdate(false);
			self.isBusy(true);

			self.repository.refreshOrder(order.orderDetail.orderId)
				 .done(function (order) {
				 	app.analytics.sendPageView(app.analytics.pageViews.refreshEventSuccess);
				 	self.isBusy(false);
				 	self.showConfirm(true);
				 })
				 .fail(function () {
				 	app.analytics.sendPageView(app.analytics.pageViews.refreshEventError);
				 	self.isBusy(false);
				 	self.showUpdate(true);
				 	toastr.error("Sorry there was a problem updating the event. Please make sure you have a good connection and try again.", "", { positionClass: "toast-bottom-full-width", timeOut: 4000 });
				 })
				 .progress(function (progressState) {
				 	self.downloadProgress(progressState.progressPercent);
				 });
		};

		self.cancel = function () {
			app.analytics.sendPageView(app.analytics.pageViews.refreshEventCancel);
			navigateToEventHome();
			self.showConfirm(false);
		};

		self.close = function () {
			navigateToEventHome();
			self.showConfirm(false);
		};


		function navigateToEventHome() {
			$.mobile.changePage("home.html", {
				transition: "fade",
				type: "get",
				changeHash: true
			});
		};
	};

	function eventDeleteViewModel(repository, order) {

		var self = this;

		self.order = order;
		self.repository = repository;
		self.fullName = order.orderDetail.fullName;
		self.email = order.orderDetail.email;
		self.orderId = order.orderDetail.orderId;
		self.eventName = order.offeringEvent.title;
		self.showConfirm = ko.observable(false);

		self.isBusy = ko.observable(false);
		self.showDelete = ko.observable(true);

		self.deleteEvent = function () {
			//delete the event by calling method on the repository
			self.repository.deleteLocalOrder(self.orderId);
			app.analytics.sendAppEvent(app.analytics.appEvents.deleteEventConfirm(self.order.offeringEvent.code));

			self.showDelete(false);
			self.showConfirm(true);
		};

		self.letsGo = function () {
			navigateToAppHome();
		};

		self.cancel = function () {
			app.analytics.sendAppEvent(app.analytics.appEvents.deleteEventCancel(self.order.offeringEvent.code));
			navigateToEventHome();
		};

		function navigateToAppHome() {

			var Backlen = window.history.length;
			window.history.go(-Backlen);
			window.location = "index.html";
		};

		function navigateToEventHome() {

			$.mobile.changePage("home.html", {
				transition: "fade",
				type: "get",
				changeHash: true
			});
		};

	};

	function homeViewModel(repository) {
		app.log("viewmodels.js: homeViewModel");
		var self = this;

		self.repository = repository;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.hideHelp = ko.observable(app.main.currentState.hideHelp);

		//get ref to computed observable for new announcementCount
		self.newAnnouncementCount = self.repository.getNewAnnouncementCount();
		self.topTweet = self.repository.getTopTweet();
		self.currentEvent = ko.observable(app.cache.data.CurrentOrder);
		self.sponsorUrl = app.cache.data.CurrentOrder.offeringEvent.branding.appSponsorUrl;
		self.showAppSponsor = app.cache.data.CurrentOrder.offeringEvent.branding.appSponsorLogo;

		//self.showCheckin = ko.computed(function () {
		//	return app.cache.data.CurrentOrder.offeringEvent.isOnsitePrintingEnabled || false;
		//})

		self.openSponsor = function () {
			if (self.sponsorUrl) {
				app.analytics.sendPageView(app.analytics.pageViews.sponsorClick('home'));
				app.Common.openExternalLink(self.sponsorUrl);
			}
		};
		self.openCheckin = function () {
			if (true) {
				app.analytics.sendPageView(app.analytics.pageViews.checkin);
				app.Common.openExternalLink(app.eventsMobileSettings.domain + "/checkin/?offeringId=" + app.cache.data.CurrentOrder.offeringEvent.offeringId + "&orderId=" + app.cache.data.CurrentOrder.orderDetail.orderId + "&source=ONSITEAPP");
			}
		};
		self.hideTip = function () {
			$('#tipPanel').fadeOut(function () {
				self.hideHelp(true);
				app.main.currentState.hideHelp = true;
				self.repository.setHideHelp(true);
			});
		};

		self.now = self.repository.getRightNow();

		self.announcement = self.repository.getTopAnnouncement();
	};

	function announcementsViewModel() {
		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.announcements = undefined;

		self.newAnnouncementCount = undefined;

		self.sponsorUrl = undefined;

		self.showAppSponsor = false;


		self.openSponsor = function () {
			if (self.sponsorUrl) {
				app.analytics.sendPageView(app.analytics.pageViews.sponsorClick('announcements'));
				app.Common.openExternalLink(self.sponsorUrl);
			}
		};
	};

	function myScheduleViewModel() {

		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.schedule = [];
	};

	function sessionViewModel(repository, updater) {

		var self = this;

		self.repository = repository;

		self.sessionType = null;
		self.materialsDomain = app.eventsMobileSettings.materialsDomain;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel(self));
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.updater = updater;

		self.openExternalLink = function (data) {
			app.Common.openExternalLink(data.url(), data.fileType());
		};

		self.openExternalFile = function (data) {
			app.Common.openExternalFile(data.url());
		};
		self.shareSession = function () {
			var mailUri = 'mailto:?subject=' + encodeURIComponent(self.session.title()) + '&body=I found this session I thought you might like - ' + encodeURIComponent(self.session.title());
			window.location.href = mailUri;
			//window.open(mailUri);
			app.analytics.sendPageView(app.analytics.pageViews.shareSession(self.session.code()));
		};
		self.hideHelp = ko.observable(app.main.currentState.hideSessionHelp);

		self.hideTip = function () {
			$('#tipPanel').fadeOut(function () {
				self.hideHelp(true);
				app.main.currentState.hideSessionHelp = true;
				self.repository.setHideSessionHelp(true);
			});
		};

		self.session = null;
	}

	function presenterViewModel(updater) {

		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel(self));
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.updater = updater;

		self.profile = null;
	}

	function presentersViewModel() {
		var self = this;

		self.presenters = [];

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel(self));
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

	}

	function resourcesViewModel() {
		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.openExternalLink = function (data) {
			app.analytics.sendPageView(app.analytics.pageViews.resourceDetail(data.title));
			app.Common.openExternalLink(data.url, data.fileType);
		};

		self.resources = [];
	}

	function mapViewModel() {
		var self = this;

		self.mapImageData = null;
		self.mapRoomCoords = null;
		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.isHelpHidden = ko.observable(app.main.currentState.hideMapHelp);
		self.hideHelp = function () {
			repository.setHideMapHelp(true);
			app.main.currentState.hideMapHelp = true;
			self.isHelpHidden(true);
		};

	};

	function optionsViewModel() {
		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.gotoEventUpdate = function () {
			app.analytics.sendPageView(app.analytics.pageViews.optionItem('updateEvent'));
			$.mobile.changePage("eventupdate.html", {
				transition: "fade",
				type: "get",
				changeHash: true
			});
		};
		self.resetHelpTips = function () {
			cache.resetHelpTips();
			toastr.info("Help tips have been reset to display in the app.", "", { positionClass: "toast-bottom-full-width" });
			app.analytics.sendPageView(app.analytics.pageViews.optionItem('resetHelpTips'));

		};

		self.deleteEvent = function () {
			app.analytics.sendPageView(app.analytics.pageViews.optionItem('deleteEvent'));
			$.mobile.changePage("eventdelete.html", {
				transition: "fade",
				type: "get",
				changeHash: true
			});
		};

		self.playBackSound = ko.observable(app.main.currentState.playBackSound);
		self.isiOS = app.main.isiOS;

		self.togglePlayBackSound = function () {
			newOption = !app.main.currentState.playBackSound;
			self.playBackSound(newOption);
			app.main.currentState.playBackSound = newOption;
			repository.setPlayBackSound(newOption);
			app.analytics.sendPageView(app.analytics.pageViews.optionItem('toggleBackSound'));
		};

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();
	};

	function aboutViewModel() {
		var self = this;

		self.dx = null;
		self.version = null;
		self.eventName = null;
		self.attendeeName = null;
		self.attendeeEmail = null;
		self.orderId = null;
		self.deviceTime = null;
		self.dataHost = null;
		self.lastNotesUpload = null;
		self.openTerms = function () {
			app.Common.openExternalLink(' http://www.ihi.org/pages/termsofuse.aspx');
		};
		self.deviceInfo = null;
		self.errorLog = null;
		self.queuedAnalyticsCount = 0;
	};

	function venueViewModel() {

		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel(self));
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.name = ko.observable();
		self.address = ko.observable();
		self.city = ko.observable();
		self.state = ko.observable();
		self.country = ko.observable();
		self.phone = ko.observable();
		self.website = ko.observable();
		self.mapSearchUrl = ko.computed(function () {
			return encodeURI("http://www.bing.com/maps/default.aspx?q=" + self.name() + "," + self.address() + "," + self.city() + "," + self.state() + "," + self.country());
		});
	};

	function exhibitorsViewModel() {
		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.levels = [];

		self.exhibitors = null;
	};

	function feedbackViewModel(settings) {

		var self = this;

		self.platform = app.main.isiOS ? 'iOS' : 'Android';

		var deviceInfo = app.main.deviceInfo.get();
		var appVersion = 'app version: ' + settings.appVersion;
		var emailBody = "body=%0D%0A%0D%0AHere's my diagnostic information to help IHI address my feedback.%0D%0A%0D%0ADiagnostic Info:%0D%0A" + deviceInfo + " " + appVersion;
		var feedbackEmailSubject = "subject=IHI Onsite App Feedback - " + app.cache.data.CurrentOrder.offeringEvent.title;
		var issueEmailSubject = "subject=IHI Onsite App Issues - " + app.cache.data.CurrentOrder.offeringEvent.title;

		self.feedbackEmailUri = settings.feedbackEmail + '?' + feedbackEmailSubject + '&' + emailBody;
		self.issueEmailUri = settings.issueEmail + '?' + issueEmailSubject + '&' + emailBody;


		self.gotoReview = function () {
			var reviewUrl = '';
			switch (self.platform) {
				case 'iOS':
					reviewUrl = settings.iosReviewUri;
					window.open(reviewUrl, '_blank', 'location=yes,enableViewportScale=yes');
					break;

				case 'Android':
					reviewUrl = settings.androidReviewUri;
					window.open(reviewUrl, '_system');
					break;
			}
		};

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();
	}

	function exhibitorViewModel(updater) {
		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel(self));
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.openSite = function () {
			if (self.exhibitor.url()) {
				app.Common.openExternalLink('http://' + self.exhibitor.url());
			}
		};
		self.updater = updater;
		self.exhibitor = null;
	}

	function notesViewModel() {

		var self = this;
		self.isBusy = ko.observable(false);

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.openMyIHI = function () {
			app.Common.openExternalLink('http://www.ihi.org/myihi/default.aspx');
		};


		/*need to hook in*/
		self.sendNotes = function () {
			$.mobile.changePage("notesupload.html", {
				transition: "fade",
				type: "get",
				changeHash: true
			});
		};

		self.notes = [];
	}

	function notesUploadViewModel() {

		var self = this;

		self.isBusy = ko.observable(false);
		self.showUpload = ko.observable(true);
		self.showConfirm = ko.observable(false);
		self.uploadProgress = ko.observable(0);
		self.fullName = '';
		self.email = '';

		self.goBack = function () {

			history.go(-1);
		};

		self.sendNotes = function () {
			self.isBusy(true);
			self.showUpload(false);

			repository.saveSessionNotesToServer()
			.done(function (response) {
				if (response.errorCode === 0) {
					self.showConfirm(true);
				}
				else {
					self.showUpload(true);
					toastr.error("Sorry there was a problem sending your notes to my.ihi.org.", "", { positionClass: "toast-bottom-full-width" });
				}
			})
			.fail(function () {
				self.showUpload(true);
				toastr.error("Sorry there was a problem sending your notes to ihi.org. Please make sure you have a good connection and try again.", "", { positionClass: "toast-bottom-full-width" });
			})
			.always(function () {
				self.isBusy(false);
			})
			.progress(function (progressState) {
				self.uploadProgress(progressState.progressPercent);
			});
		};

		self.gotoMyIhi = function () {
			window.open('https://www.ihi.org/myihi', '_blank', 'location=yes,enableViewportScale=yes');
		};
	}

	function noteViewModel(note) {
		var self = this;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.note = note;

		self.isHelpHidden = ko.observable(false);
		self.hideHelp = function () {
			repository.setHideNoteHelp(true);
			app.main.currentState.hideNoteHelp = true;
			self.isHelpHidden(true);
		};

		throttledNotesValue = ko.computed(self.note.note)
						.extend({ throttle: 500 });

		throttledNotesValue.subscribe(function (note) {
			self.saveNotes();

		}, this);

		self.saving = ko.observable(false);

		self.saveNotes = function () {
			self.saving(true);
			self.note.lastUpdatedDate(new Date());
			repository.saveSessionNote(ko.mapping.toJS(self.note));
			self.saving(false);
		};
	}

	function twitterViewModel() {
		var self = this;

		self.siteRegEx = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

		self.order = app.cache.data.CurrentOrder;

		self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel());
		self.searchViewModel().hookUpToPage();

		self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
		self.mainMenuViewModel().hookUpToPage();

		self.tweets = ko.observableArray(self.order.tweets.statuses);

		self.filter = ko.observable(unescape(self.order.tweets.query).replace(/\+/g, ' '));

		self.refreshTweets = function () {
			self.isBusy(true);
			repository.getTweets()
			.done(function (response) {
				if (response.statuses && response.statuses.length > 0) {
					linkifyTweets(response.statuses);
					self.tweets.removeAll();
					ko.utils.arrayPushAll(self.tweets, response.statuses);
					self.filter(unescape(response.query).replace(/\+/g, ' '));
					self.tweets.valueHasMutated();
				}
			})
			.fail(function (hxr) {
				toastr.info("Sorry could not load latest tweets at this time - displaying the previous tweets for now.", "", { positionClass: "toast-bottom-full-width" });
			})
			.always(function () {
				self.isBusy(false);
			});
		};

		self.isBusy = ko.observable(false);

		function linkifyTweets(tweets) {
			for (var i = 0; i < tweets.length; i++) {
				//modify urls found in tweets so they are clickable links that open in browser

				//tweets[i].text = tweets[i].text.replace(self.siteRegEx, "<a target=\"_system\" href=" + "\"$1\">$1</a>");
				tweets[i].text = tweets[i].text.replace(self.siteRegEx, "<a href=\"#\" onclick=\"window.open('$1', '_blank', 'location=yes,enableViewportScale=yes');\">$1</a>");
			};

		}
	}

	function programViewModel(repository, updater) {

		var self = this;

		self.updater = updater;

		self.repository = repository;

		self.hideHelp = ko.observable(app.main.currentState.hideProgramHelp);

		self.hideTip = function () {
			$('#tipPanel').fadeOut(function () {
				self.hideHelp(true);
				app.main.currentState.hideProgramHelp = true;
				self.repository.setHideProgramHelp(true);
			});
		};

		self.hookupMasterElements = function () {
			self.searchViewModel = ko.observable(app.viewModelBuilder.getSearchViewModel(self));
			self.searchViewModel().hookUpToPage();

			self.mainMenuViewModel = ko.observable(app.viewModelBuilder.getMenuViewModel());
			self.mainMenuViewModel().hookUpToPage();
		};
		self.currentViewType = ko.observable("type");
		self.filteredSessionsList = ko.observableArray();
		self.filteredGroupedList = ko.observableArray();
		self.filteredLabel = ko.observable();

		self.viewByDay = function () {
			resetForViewBy("day", "byday");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramList('day'));
		};

		self.viewByType = function () {
			resetForViewBy("type", "bytype");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramList('type'));
		};

		self.viewByTrack = function () {
			resetForViewBy("track", "bytrack");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramList('track'));
		};

		self.viewByStyle = function () {
			resetForViewBy("style", "bystyle");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramList('format'));
		};


		self.scheduleSelected = function (item) {
			$('#filteredSessions').show();
			var timeslotLabel = item.title + ' @ ' + item.time;
			scrollToTop();
			self.filteredSessionsList.removeAll();
			self.filteredLabel(timeslotLabel);
			var session;

			if (item.sessions.length > 1) {
				for (var i = 0; i < item.sessions.length; i++) {
					session = $.grep(self.program.sessions, function (val) { return val.id === item.sessions[i]; })[0];

					//ignore the sessions not found - due to the isPublicAgenda flag not being always correct 
					if (session) {
						repository.ensureSessionHasTypeColor(session);
						self.filteredSessionsList.push(session);
					}
				}
				self.currentViewType("daydetail");
				app.analytics.sendPageView(app.analytics.pageViews.fullProgramByDay(timeslotLabel));

			}
			else {
				if (item.sessions.length === 1) {
					session = $.grep(self.program.sessions, function (session, index) { return session.id === item.sessions[0]; })[0];
					//ignore the sessions not found - due to the isPublicAgenda flag not being always correct 
					if (session) {
						repository.ensureSessionHasTypeColor(session);
						self.sessionSelected(session);
					}
				}
				else {
					throw ('no sessions for this time slot');
				}
			}
		};

		self.typeSelected = function (item) {
			$('#filteredSessions').show();
			scrollToTop();

			self.filteredSessionsList.removeAll();
			self.filteredLabel(item.title);
			var session;
			for (var i = 0; i < item.sessions.length; i++) {
				session = $.grep(self.program.sessions, function (val) { return val.id === item.sessions[i]; })[0];
				//ignore the sessions not found - due to the isPublicAgenda flag not being always correct 
				if (session) {
					repository.ensureSessionHasTypeColor(session);
					self.filteredSessionsList.push(session);
				}
			}
			self.currentViewType("typedetail");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramByType(item.title));
		};

		self.styleSelected = function (item) {
			$('#filteredSessions').show();
			scrollToTop();

			self.filteredSessionsList.removeAll();
			self.filteredLabel(item.title);
			var session;
			for (var i = 0; i < item.sessions.length; i++) {
				session = $.grep(self.program.sessions, function (val) {
					return val.id === item.sessions[i];
				})[0];
				//ignore the sessions not found - due to the isPublicAgenda flag not being always correct 
				if (session) {
					repository.ensureSessionHasTypeColor(session);
					self.filteredSessionsList.push(session);
				}
			}
			self.currentViewType("styledetail");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramByFormat(item.title));

		};

		self.trackSelected = function (item) {
			$('#filteredGroupedSessions').show();
			scrollToTop();

			self.filteredGroupedList.removeAll();
			self.filteredLabel(item.name);
			//find the track
			var track = item;
			var newItem;
			var tracksessions;
			var session;

			//iterate over the session types in the track
			for (var i = 0; i < track.sessionTypes.length; i++) {
				//create newItem
				newItem = { "type": repository.getSessionType(track.sessionTypes[i].id).title, "sessions": [] };
				tracksessions = track.sessionTypes[i].sessionIds;

				//iterate over the sessionids in the track, look them up and add them to the sessions array
				for (var j = 0; j < tracksessions.length; j++) {
					session = $.grep(self.program.sessions, function (val) { return val.id === tracksessions[j]; })[0];

					//ignore the sessions not found - due to the isPublicAgenda flag not being always correct 
					if (session) {
						repository.ensureSessionHasTypeColor(session);
						newItem.sessions.push(session);
					}
				}
				self.filteredGroupedList.push(newItem);
			}
			self.currentViewType("trackdetail");
			app.analytics.sendPageView(app.analytics.pageViews.fullProgramByTrack(item.name));
		};

		self.sessionSelected = function (session) {

			saveProgramState();

			$.mobile.changePage("session.html?id=" + session.id, {
				transition: "fade",
				type: "get",
				changeHash: true
			});
		};

		self.init = function () {
			//load any previous state
			restoreProgramState();

			//process any query params passed in from search results
			handleDeepLink();
		};

		var resetForViewBy = function (viewByType, hash) {
			scrollToTop();
			$('#filteredSessions').hide();
			$('#filteredGroupedSessions').hide();
			self.filteredSessionsList.removeAll();
			self.filteredGroupedList.removeAll();
			self.currentViewType(viewByType);
		};

		var restoreProgramState = function () {

			cache.data.ProgramState.get()
				.done(function(state) {
					if (state) {

						self.currentViewType(state.currentViewType),
							self.filteredSessionsList(state.filteredSessionsList),
							self.filteredGroupedList(state.filteredGroupedList),
							self.filteredLabel(state.filteredLabel);

						cache.data.ProgramState.remove();
					} else {
						app.analytics.sendPageView(app.analytics.pageViews.fullProgramList('type'));
					}
				});
		};

		var saveProgramState = function () {
			//save entire viewmodel so it can be restored when returning from session
			var state = {
				currentViewType: self.currentViewType(),
				filteredSessionsList: self.filteredSessionsList(),
				filteredGroupedList: self.filteredGroupedList(),
				filteredLabel: self.filteredLabel()
			};

			cache.data.ProgramState.set(state);
		};

		var handleDeepLink = function () {

			//if 'by' param passed in - track or type or style
			var params = app.Common.getQueryStringParams();
			var by = params['by'];
			var selectedItemName = params['name'];

			if (by && selectedItemName) {
				self.updateCurrentState(by, selectedItemName);
			};
		};
		var scrollToTop = function () {
			$('html, body').animate({ scrollTop: $("#program").offset().top }, 0);
		};
		self.updateCurrentState = function (by, selectedItemName) {
			switch (by) {

				case 'track':
					self.currentViewType('bytrack');
					if (selectedItemName) {
						//find the type
						var foundTrack = $.grep(self.program.tracks, function (val) {
							return val.name === selectedItemName;
						})[0];
						if (foundTrack) {
							self.trackSelected(foundTrack);
						}
					}
					break;

				case 'type':
					self.currentViewType('bytype');
					if (selectedItemName) {
						//find the type
						var foundType = $.grep(self.program.types, function (val) { return val.title === selectedItemName; })[0];
						if (foundType) {
							self.typeSelected(foundType);
						}
					}
					break;

				case 'style':
					self.currentViewType('bystyle');
					if (selectedItemName) {
						//find the style
						var foundStyle = $.grep(self.program.styles, function (val) { return val.title === selectedItemName; })[0];
						if (foundStyle) {
							self.styleSelected(foundStyle);
						}
					}
					break;

			}
		};

		self.program = null;

	}

	function mainMenuViewModel(menuItems) {
		var self = this;

		self.alreadyBound = false;

		if (menuItems) {
			self.menuItems = menuItems;

			/*wireup event to bind the current menu items to the mainmenu panel*/
			self.hookUpToPage = function () {
				if ($.mobile.activePage) {
					$.mobile.activePage.find('#mainMenuPanel').on('panelbeforeopen', function () {
						app.analytics.sendAppEvent(app.analytics.appEvents.slideOutMenuOpen());
						if (!self.alreadyBound) { //don't rebind
							ko.applyBindings(self, $.mobile.activePage.find('#mainMenuPanel')[0]);
							self.alreadyBound = true;
						}
					});
				}
				else {
					throw ('main menu viewmodel cannot bind to ui - there is no active page');
				}
			};
		}
		else {
			throw "mainMenuViewModel requires menu items to be initialized";
		}


	};

	function searchViewModel(pageViewModel) {

		var self = this,
			 minimumSearchLength = 2;

		self.pageViewModel = pageViewModel;
		self.alreadyBound = false;
		self.foundSessions = ko.observableArray();
		self.foundPresenters = ko.observableArray();
		self.foundExhibitors = ko.observableArray();
		self.foundTracks = ko.observableArray();
		self.foundStyles = ko.observableArray();
		self.foundTypes = ko.observableArray();
		self.foundFeatures = ko.observableArray();
		self.foundResources = ko.observableArray();
		self.foundAnnouncements = ko.observableArray();
		self.searchText = ko.observable('');
		self.searching = ko.observable(false);
		self.totalItemsFound = ko.observable(0);
		self.data = {};
		self.navigateToItem = function (type, item) {

			var destinationPage = getDestinationPageByType(type);

			//same page - need to do some funky stuff
			if ($('.ui-page-active').data('url').indexOf(destinationPage) > 0) {
				//viewmodel has been passed in and it has an updater function
				if (self.pageViewModel && self.pageViewModel.updater) {
					//program view needs the type for tracks and types
					if (type === 'track' || type === 'type' || type === 'style') {
						item.by = type; //append 'by' property to item
					}
					self.pageViewModel.updater(item);
					app.analytics.sendPageView(app.analytics.pageViews.searchResultSelected(type, item.title || item.name));
					$.mobile.activePage.find('#searchPanel').panel("close");
				}
			}
				//different page - just change page
			else {
				var url;
				if (type === 'resource') {
					app.Common.openExternalLink(item.url, item.fileType);
				}
				else {
					if (type === 'feature') {
						url = item.url;
					}
					else if (type !== 'track' && type !== 'type' && type !== 'style') {
						url = destinationPage + "?id=" + item.id;
					}
					else {
						url = destinationPage + "?by=" + type + "&name=" + item.title;
					}

					app.analytics.sendPageView(app.analytics.pageViews.searchResultSelected(type, item.title));

					$.mobile.changePage(url, {
						transition: "fade",
						type: "get",
						changeHash: true
					});
				}
			}
		};

		var getDestinationPageByType = function (type) {
			switch (type) {
				case 'session':
					return 'session.html';
					break;

				case 'presenter':
					return 'presenter.html';
					break;

				case 'exhibitor':
					return 'exhibitor.html';
					break;

				case 'track':
				case 'type':
				case 'style':
					return 'program.html';
					break;
				case 'announcement':
					return 'announcements.html';
					break;

				default:
					return '';
					break;
			}
		};

		self.noResults = ko.computed(function () {
			return (self.searching() === false && self.searchText().length > minimumSearchLength - 1 && self.totalItemsFound() === 0);
		}).extend({ throttle: 310 });

		throttledSearchTermValue = ko.computed(self.searchText)
								  .extend({ throttle: 300 });

		throttledSearchTermValue.subscribe(function (textToSearchFor) {
			if (textToSearchFor.length > minimumSearchLength - 1) {
				search(textToSearchFor);
				app.analytics.sendPageViewDebounced(app.analytics.pageViews.searchTerm(textToSearchFor));
			}
			else {
				clearCollections();
			}
		}, this);

		/*wireup event to bind the current search results to the search panel*/
		self.hookUpToPage = function () {
			if ($.mobile.activePage) {
				$.mobile.activePage.find('#searchPanel').on('panelbeforeopen', function () {

					if (!self.alreadyBound) { //don't rebind
						ko.applyBindings(self, $.mobile.activePage.find('#searchPanel')[0]);
						self.alreadyBound = true;
					}
				});

				$.mobile.activePage.find('#searchPanel').on('panelopen', function () {
					$.mobile.activePage.find('#searchTextbox')[0].focus();
					app.analytics.sendAppEvent(app.analytics.appEvents.searchOpen());
				});
			}
			else {
				throw ('search viewmodel cannot bind to ui - there is no active page');
			}
		};

		var search = function (searchTerm) {

			self.searching(true);

			clearCollections();

			var lowercaseTerm = searchTerm.toLowerCase();
			//search sessions, presenters, announcements and exhibitors collections
			ko.utils.arrayPushAll(self.foundSessions(), $.grep(self.data.sessions, function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundPresenters(), $.grep(self.data.presenters, function (val) {
				return val.name.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundExhibitors(), $.grep(self.data.exhibitors, function (val) {
				return val.name.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundTracks(), $.grep(self.data.tracks, function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundStyles(), $.grep(self.data.styles, function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundTypes(), $.grep(self.data.types, function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundFeatures(), $.grep(self.data.features, function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			ko.utils.arrayPushAll(self.foundResources(), $.grep(self.data.resources, function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));
			ko.utils.arrayPushAll(self.foundAnnouncements(), $.grep(self.data.announcements(), function (val) {
				return val.title.toLowerCase().indexOf(lowercaseTerm) > -1;
			}));

			notifySearchResultsChanged();
			self.searching(false);
		};

		var notifySearchResultsChanged = function () {
			self.foundSessions.valueHasMutated();
			self.foundPresenters.valueHasMutated();
			self.foundExhibitors.valueHasMutated();
			self.foundTracks.valueHasMutated();
			self.foundTypes.valueHasMutated();
			self.foundStyles.valueHasMutated();
			self.foundFeatures.valueHasMutated();
			self.foundResources.valueHasMutated();
			self.foundAnnouncements.valueHasMutated();
			self.totalItemsFound(self.foundSessions().length + self.foundPresenters().length + self.foundExhibitors().length + self.foundTracks().length + self.foundTypes().length + self.foundStyles().length + self.foundFeatures().length + self.foundResources().length);
		};

		var clearCollections = function () {
			//clear collections
			self.foundSessions.removeAll();
			self.foundPresenters.removeAll();
			self.foundExhibitors.removeAll();
			self.foundTracks.removeAll();
			self.foundTypes.removeAll();
			self.foundStyles.removeAll();
			self.foundFeatures.removeAll();
			self.foundResources.removeAll();
			self.foundAnnouncements.removeAll();
			notifySearchResultsChanged();
		};
	};

	return vms;

})(jQuery.Deferred, app.cache, app.repository);
