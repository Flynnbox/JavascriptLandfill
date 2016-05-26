//logging
app.error = (function (cache) {

	app.log("loading error.js");

	var logging = {
		upload: uploadErrors,
		startPolling: startErrorPolling,
		stopPolling: stopErrorPolling,
		log: logError
	};

	//returns a throttled version of a function - copied from underscore
	var throttle = function (func, wait) {
		var context, args, timeout, result;
		var previous = 0;
		var later = function () {
			previous = new Date;
			timeout = null;
			result = func.apply(context, args);
		};
		return function () {
			var now = new Date;
			var remaining = wait - (now - previous);
			context = this;
			args = arguments;
			if (remaining <= 0) {
				clearTimeout(timeout);
				timeout = null;
				previous = now;
				result = func.apply(context, args);
			} else if (!timeout) {
				timeout = setTimeout(later, remaining);
			}
			return result;
		};
	};

	var errorUploadPollingInterval;

	amplify.subscribe(app.events.appState.errorOccurred, logError);

	function logToConsole(error, message) {
		var formattedMessage = formatCustomError(error, message);
		app.log("%cERROR:%c" + formattedMessage, "color: red; font-weight: bold;", "color: red;");
	}

	//start the interval for error uploading
	function startErrorPolling(pollingTime) {

		if (!errorUploadPollingInterval) {
			errorUploadPollingInterval = setInterval(function () { app.Common.defer(uploadErrors) }, pollingTime);
			app.log('started the error upload polling');
		}
	};

	//stop the interval for error uploading
	function stopErrorPolling() {
		if (errorUploadPollingInterval) {
			clearInterval(errorUploadPollingInterval);
			errorUploadPollingInterval = null;
			app.log('stopped the error upload polling');
		}
	};

	//attempt to upload all awaiting errors
	function uploadErrors() {
		try {
			cache.data.Errors.get()
				.done(function(errors) {
					if (errors && errors.length > 0) {

						app.log('errors awaiting upload - try to send to server');

						//mark all items inProcess = true
						errors = $.map(errors,
							function(error, i) {
								error.inProcess = true;
								return error;
							});

						//put back in ls
						cache.data.Errors.set(errors);

						var deviceInfo = app.main.deviceInfo.get();

						//build errors payload
						//NOTE: handles legacy errors that may have been written to device local storage before offeringId was included in the error object
						var errorPayload = $.map(errors,
							function(error, i) {
								return {
									'orderId': error.orderId,
									'offeringId': (error.hasOwnProperty('offeringId') ? error.offeringId : -1),
									'clientState': 'timestamp: ' +
										error.timestamp +
										', message: ' +
										error.message +
										', url: ' +
										error.url +
										', orderId : ' +
										error.orderId +
										', offeringId : ' +
										error.offeringId +
										', stack :' +
										error.stack +
										' DEVICEINFO ' +
										deviceInfo
								};
							});

						app.serviceApi.saveErrorsToServer({ "errors": errorPayload })
							.done(logCleanUp)
							.fail(errorlogUploadFailed);
					} else {
						app.log('no errors awaiting upload');
					}
				})
				.fail(function(e) {
					logToConsole(e, 'uploadErrors:failed to upload errors');
				});
		} catch (e) {
			logToConsole(e, 'uploadErrors:failed to upload errors');
		}
	}

	//log error to local storage
	function logError(error, message, url, line) {
		var newError = createCustomError(error, message, url, line);
		logToConsole(newError);

		//get log from local storage
		cache.data.Errors.get().done(function (errors) {
			try {

				//remove last error from log to make room for new one
				if (errors.length > app.eventsMobileSettings.errorLogMaxLength) {
					errors.pop(); //remove last item
				}

				//add new error and save
				errors.push(newError);
				cache.data.Errors.set(errors);
			}
			catch (e) {
				logToConsole(e, 'logError failed');
			}
		})
		.fail(function (e) {
			logToConsole(e, 'uploadErrors:failed to upload errors');
		});
	}

	//throttled version of log error so as to not overload the log for databinding errors
	var logErrorThrottled = throttle(function (error) {
		logError(error);
	}, 5000);

	//delete all processed errors
	function logCleanUp() {

		try {
			cache.data.Errors.get().done(function (errors) {
				//remove all processed errors
				errors = $.grep(errors, function (error) {
					return error.inProcess === false;
				});

				//save filtered list to localstorage
				cache.data.Errors.set(errors);
			})
			.fail(function (e) {
				logToConsole(e, 'uploadErrors:failed to upload errors');
			});
		}
		catch (e) {
			logToConsole(e, 'logCleanup failed', 'error.js');
		}
	}

	function errorlogUploadFailed(xhr) {
		logToConsole(new Error("XHR error"), 'failed to save errors to server', 'error.js');
	}

	//custom data binding provider that will handle exceptions
	//need to set 'ko.bindingProvider.instance' to this function
	function ErrorHandlingBindingProvider() {
		var original = new ko.bindingProvider();

		//determine if an element has any bindings
		this.nodeHasBindings = original.nodeHasBindings;

		//return the bindings given a node and the bindingContext
		this.getBindings = function (node, bindingContext) {
			var result;
			try {
				result = original.getBindings(node, bindingContext);
			}
			catch (e) {
				//log binding errors here - throttle it
				logErrorThrottled(createCustomError(null, 'data binding not found error', node.baseURI, node.outerHTML));
			}

			return result;
		};
	};

	function formatCustomError(error, message) {
		if (error instanceof Error) {
			error = createCustomError(error, message);
		}
		return error.message + "; URL: " + error.url + "; TIMESTAMP: " + error.timestamp + "; STACK: " + error.stack;
	}

	function createCustomError(error, message, url, stack) {
		if (error instanceof Error) {
			return createCustomError(null,
				message ? (message + " [" + error.name + ":" + error.message + "]") : (error.name + ":" + error.message),
				url || error.fileName,
				stack || error.stack);
		}
		return {
			'message': message,
			'url': url,
			'timestamp': new Date().toISOString(),
			'orderId': app.cache.data.CurrentOrder ? app.cache.data.CurrentOrder.orderDetail.orderId : -1,
			'offeringId': app.cache.data.CurrentOrder ? app.cache.data.CurrentOrder.offeringEvent.offeringId : -1,
			'inProcess': false,
			'stack': stack
		}
	}

	function parseStack(stack) {
		return stack
			? $.grep(stack.split(" at "), function(item) { return item.indexOf("onsite/includes/js/app") > -1; }).join(" | ")
			: stack;
	}

	//set the bindingProvider to the new one that can handle binding errors
	ko.bindingProvider.instance = new ErrorHandlingBindingProvider();

	return logging;
}(app.cache));
