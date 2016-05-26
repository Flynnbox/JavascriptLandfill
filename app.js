if (typeof app === 'undefined') {
	app = {};
}

//if debug flag not set, logging is a no-op to improve performance
app.log = (function() {
	if (app.eventsMobileSettings.debug) {
		return function() {
			console.log.apply(console, Array.from(arguments));
		}
	}
	return function () { };
})();

app.warn = (function () {
	if (app.eventsMobileSettings.debug) {
		return function () {
			var message = Array.from(arguments).join(" ");
			app.log("%cWARNING:%c" + message, "color: #B28600; font-weight: bold;", "color: #B28600;");
		}
	}
	return function () { };
})();

//create a placeholder error object until actual erro object is initialized after cache is available
app.error = (function() {
	return {
		upload: function () { },
		startPolling: function () { },
		stopPolling: function() {},
		log: app.log
	};
})();

//event names
app.events = {
	dataUpdates: {
		user: 'User_Data_Update_Available',
		event: 'Event_Data_Update_Available',
		announcements: 'Announcements_Data_Update_Available',
		materials: "Materials_Data_Update_Available",
		resources: "Resources_Data_Update_Available",
		features: "Features_Data_Update_Available"
	},
	appState: {
		orderHasChanged: "Order_Has_Changed",
		userViewedAnnouncements: "User_Viewed_Announcements",
		appUpdateRequired: "Application_Update_Is_Required",
		errorOccurred: "Application_Error_Occurred",
		deviceReady: "Device_Ready",
		appLaunchedWithUrl: "UrlAppLaunch",
		notifyWithToast: "Notify_Toast",
		errorNoEventData: "Error_No_Event_Data"
	}
};

app.main = (function () {

	var initialNetworkCheckDone = false;
	var isMobile = navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry)/) !== null;
	var iOS = navigator.userAgent.match(/(iPhone|iPod|iPad)/) !== null;
	var main = {

		masterElements: null,
		isiOS: iOS,
		isOnline: ko.observable(false),

		currentState: {
			hideHelp: false,
			hideSwipeHelp: false,
			hideNoteHelp: false,
			hideMapHelp: false,
			hideProgramHelp: false,
			hideSessionHelp: false,
			playBackSound: true
		},

		dataPollingDx: {
			serverPolled: ko.observable(moment('1/1/1')),
			nowUpdated: ko.observable(moment('1/1/1')),
			eventUpdated: ko.observable(moment('1/1/1')),
			announcementsUpdated: ko.observable(moment('1/1/1')),
			materialsUpdated: ko.observable(moment('1/1/1')),
			resourcesUpdated: ko.observable(moment('1/1/1')),
			featuresUpdated: ko.observable(moment('1/1/1')),
			tweetsUpdated: ko.observable(moment('1/1/1')),
			currentAnnouncementsUpdated: ko.observable(moment('1/1/1')),
			orderSessionsUpdated: ko.observable(moment('1/1/1'))
		},

		deviceInfo: {
			model: 'PC',
			cordova: 'n/a',
			platform: 'PC',
			uuid: 'n/a',
			version: '0',
			isMobile: isMobile,
			get: function () {
				return 'model : ' + this.model + ' cordova : ' + this.cordova + ' platform : ' + this.platform + ' uuid : ' + this.uuid + ' version : ' + this.version;
			}
		},

		initializeDeviceReady: function () {
			if (isMobile) {
				document.addEventListener("deviceready", main.onDeviceReady, false);
			} else {
				main.onDeviceReady(); //this is the browser
			}
		},

		//phone gap franework ready
		onDeviceReady: function () {
			self = this;
			if (isMobile) {
				document.addEventListener("offline", main.onOffline, false);
				document.addEventListener("online", main.onOnline, false);
				document.addEventListener("menubutton", main.onMenu, false);//android menu button pressed
				document.addEventListener("searchbutton", main.onSearch, false);//android search button pressed

				main.deviceInfo.model = device.model;
				main.deviceInfo.cordova = device.cordova;
				main.deviceInfo.platform = device.platform;
				main.deviceInfo.uuid = device.uuid;
				main.deviceInfo.version = device.version;
				main.deviceInfo.isMobile = true;
			}
			else {
				$(window).bind("online", main.onOnline);
				$(window).bind("offline", main.onOffline);
			}

			app.analytics.sendPageView(app.analytics.pageViews.appOpen());
		},

		//android menu button event handler
		onMenu: function () {
			$.mobile.activePage.find('#mainMenuPanel').panel("toggle");
		},

		//android search button event handler
		onSearch: function () {
			$.mobile.activePage.find('#searchPanel').panel("toggle");
		},


		onOffline: function () {
			main.isOnline(false);
			if (initialNetworkCheckDone === false) {
				initialNetworkCheckDone = true;
			}
		},


		onOnline: function () {
			main.isOnline(true);
			if (initialNetworkCheckDone === true) {
			}
			else {
				initialNetworkCheckDone = true;
			}
		}
	};

	return main;

})();

//contains functions for displaying notifications
app.notifications = (function () {

	amplify.subscribe(app.events.dataUpdates.event, newDataNotification);
	amplify.subscribe(app.events.appState.appUpdateRequired, appUpdateRequired);

	function newDataNotification() {
		setTimeout(function () {
			app.analytics.sendPageView(app.analytics.pageViews.updateAvailableToastShow);
			toastr.info('An update for your event is available - tap to update', '', {
				onclick: function () {
					toastr.clear();
					app.analytics.sendPageView(app.analytics.pageViews.updateAvailableToastSelect);
					$.mobile.changePage("eventupdate.html", {
						type: "get",
						changeHash: true,
						transition: 'none'
					});
				},
				timeout: 10000,
				positionClass: "toast-bottom-full-width"
			}
	 );
		}, 0);
	};

	function appUpdateRequired() {
		app.analytics.sendPageView(app.analytics.pageViews.appUpdateRequired);
		$.mobile.changePage("appupdate.html", {
			transition: "fade",
			type: "get",
			changeHash: true
		});
	}

	//expose public members, all other members are private
	return {};

}());

//handles page transitions for specialized circumstances
app.routing = (function () {

	function goToEventList() {
		//do not navigate if we are on the event list
		if ($.mobile.activePage[0].baseURI.indexOf("eventlist.html") > -1) {
			return;
		}
		app.log("routing to eventlist.html page");

		$.mobile.changePage("eventlist.html", {
			type: "get",
			changeHash: true,
			transition: 'none'
		});
	}

	amplify.subscribe(app.events.appState.errorNoEventData, goToEventList);
})();

window.onload = function () {
	app.main.initializeDeviceReady();
};

window.onerror = function (message, url, line) {
	switch (message) {
		case "SOMEERROR":
			break;

		default:
			amplify.publish(app.events.appState.errorOccurred, null, message, url, line);

			//only display errors that are not related to the inappbrowser bug we are waiting to be fixed
			//once the bug is fixed this check can be removed
			if (message.indexOf('event.type') === -1) {
				if (url && line) {
					toastr.error('Sorry an error has occurred - tap to close', {
						timeout: 10000,
						positionClass: "toast-bottom-full-width"
					});
					app.analytics.sendPageView(app.analytics.pageViews.errorToastShow(url + ' line: ' + line));
				}
				break;
			}
	}
	return true;
};

