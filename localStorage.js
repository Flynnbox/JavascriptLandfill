app.localStorage = (function (deferred, toastr) {

	app.log("loading localStorage.js");

	var initializedDeferred = deferred(),
			initialized = initializedDeferred.promise();
	
	function read(key, defaultValue) {
		var dfd = deferred();
		try {
			dfd.resolve(amplify.store(key) || defaultValue);
		} catch (error) {
			app.error.log(error, 'read: failed to read data for key ' + key, "localStorage.js");
			dfd.reject(error);
		}
		return dfd.promise();
	};

	function write(key, data) {
		var dfd = deferred();
		try {
			dfd.resolve(amplify.store(key, data));
		}
		catch (error) { // quota exceeded
			app.error.log(error, 'write: failed to write data for key ' + key, "localStorage.js");

			//TODO replace with publish of message
			toastr.error('The maximum storage space has been exceeded. You need to delete any old events to clear up some space');
			dfd.reject(error);
		}
		return dfd.promise();
	};

	function remove(key) {
		var dfd = deferred();
		try {
			dfd.resolve(amplify.store(key, null));
		}
		catch (error) { // quota exceeded
			app.error.log(error, 'remove: failed to remove data for key ' + key, "localStorage.js");
			dfd.reject(error);
		}
		return dfd.promise();
	};

	function initialize() {
		app.log("localStorage.js initialized");
		var key = 'localStorageInitialization';
		write(key, 'Verified')
			.then(function() {
				return read(key);
			})
			.then(function () {
				return remove(key);
			})
			.done(function () {
				initializedDeferred.resolve();
			})
			.fail(e => app.error.log(e, 'initialize:localstorage initialization failed', "localStorage.js"));
	};

	initialize();

	return {
		initialized: initialized,
		get: read,
		set: write,
		remove: remove,
		type: 'localStorage'
	};
})(jQuery.Deferred, toastr);