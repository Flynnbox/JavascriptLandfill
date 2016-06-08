app.fileStorage = (function (deferred, filePersistence, megaBytesRequested) {

	app.log("loading fileStorage.js");

	var initializedDeferred = deferred(),
	    initialized = initializedDeferred.promise(),
	    verifyFileOperationsOnInitialization = false,
	    bytesInKilobyte = 1024,
	    kilobytesinMegabyte = 1024,
	    requestedBytes = bytesInKilobyte * kilobytesinMegabyte * (megaBytesRequested || 1),
	    grantedBytes = 0,
	    persistence = filePersistence || window.PERSISTENT,
	    requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem,
	    storageInfo = window.storageInfo ||
	    (persistence === window.PERSISTENT ? navigator.webkitPersistentStorage : navigator.webkitTemporaryStorage),

	    onFileError = function(error, message) {
		    if (error instanceof DOMError) {
			    var fileError = error;
			    error = new Error(fileError.message);
			    error.name = fileError.name;
		    }
		    app.error.log(error, message, "fileStorage.js");
	    },

			tryParseJSON = function (jsonCandidate) {
				var result = { isJSON: false, json: null };
				app.log("Attempting to parse data to JSON");
				if (typeof jsonCandidate === "undefined") {
					onFileError(null, "tryParseJSON:jsonCandidate is undefined");
					return result;
				}
				if (jsonCandidate === null) {
					onFileError(null, "tryParseJSON:jsonCandidate is null");
					return result;
				}
				if (!(typeof jsonCandidate === 'string' || jsonCandidate instanceof String)) {
					onFileError(null, "tryParseJSON:jsonCandidate is not a string");
					return result;
				}
				if (jsonCandidate.length === 0) {
					app.warn("tryParseJSON:jsonCandidate is zero length string");
					return result;
				}
				try {
					result.json = JSON.parse(jsonCandidate);
					result.isJSON = true;
				} catch (error) {
					onFileError(error, "tryParseJSON:failed to parse candidate string to json");
				}
				return result;
			},

	    getStorageQuota = function(requestedBytes) {
		    app.log("Requesting File Storage Quota of " + requestedBytes + " bytes");
		    var dfd = deferred();
		    storageInfo.requestQuota(requestedBytes,
			    function(approvedBytes) {
				    grantedBytes = approvedBytes;
				    app.log("File Storage Quota Approved for " + grantedBytes + " bytes");
				    dfd.resolve(grantedBytes);
			    },
			    function(e) {
				    onFileError(e, "getStorageQuota:failed on request of file storage quota of " + requestedBytes + " bytes");
				    dfd.reject(e);
			    });
		    return dfd.promise();
	    },

	    getFileSystem = function() {
		    app.log("Requesting File System Access");
		    var dfd = deferred();
		    //passes a fileSystem to the resolve handler
		    requestFileSystem(persistence,
			    grantedBytes,
			    function(fileSystem) {
				    app.log("File System Access granted");
				    dfd.resolve(fileSystem);
			    },
			    function(e) {
				    onFileError(e, "getFileSystem:failed on request of file system access");
				    dfd.reject(e);
			    });
		    return dfd.promise();
	    },

	    //get the file, creating it as a zero length file if is does not already exist
	    getFile = function(fileSystem, fileName) {
		    var dfd = deferred();
		    app.log("Getting File Entry: " + fileName);
		    //passes a fileEntry to the resolve handler
		    fileSystem.root.getFile(fileName,
			    { create: true, exclusive: false },
			    function(fileEntry) {
				    app.log("File Entry retrieved");
				    dfd.resolve(fileEntry);
			    },
			    function(e) {
				    onFileError(e, "getFile:failed on request of file entry " + fileName);
				    dfd.reject(e);
			    });
		    return dfd.promise();
	    },

	    writeFileEntry = function(fileEntry, dataBlob) {
		    var dfd = deferred(),
		        fileBlob = dataBlob;
		    try {
			    app.log("Writing File Entry");

			    if (!fileEntry) {
				    app.log("writeFileEntry Error: fileEntry parameter is null or undefined");
				    var e = Error("writeFileEntry Error: fileEntry parameter is null or undefined", "fileStorage.js");
				    dfd.reject(e);
			    } else {
				    app.log("fileEntry.fullPath: " + fileEntry.fullPath.toString());
				    app.log("fileEntry.isFile: " + fileEntry.isFile.toString());
				    app.log("fileEntry.isDirectory: " + fileEntry.isDirectory.toString());

				    // Create a FileWriter object for our FileEntry
				    fileEntry.createWriter(function(fileWriter) {
						    var fileResized = false;

						    fileWriter.onwrite = function () {
									//only resolve promise once the file has been resized to new data length
							    if (fileResized) {
								    app.log("File Write Succeeded");
								    dfd.resolve(dataBlob);
							    }
						    };

						    fileWriter.onwriteend = function () {
						    	//IMPORTANT: file writer only overwrites that portion of data in the file
									//which includes the newly written data - need to truncate any remainder of prior data
						    	if (fileResized) {
								    return;
						    	}
						    	fileResized = true;
						    	this.truncate(this.position);
						    	app.log("File Truncation to New Data Length Succeeded");
						    };

						    fileWriter.onerror = function(error) {
							    app.log("File Write Failed");
							    onFileError(error, "writeFileEntry:failed on write of data");
							    dfd.reject(error);
						    };

						    // If data object is not passed in, create a new empty Blob.
						    if (!fileBlob) {
							    app.warn("File Write - no file data exists - creating empty file");
							    fileBlob = new Blob([''], { type: 'text/plain' });
						    }

						    if (!(fileBlob instanceof Blob)) {
							    app.warn("File Write - file data is not a Blob - converting to Blob text/plain");
							    fileBlob = new Blob([JSON.stringify(fileBlob)], { type: 'text/plain' });
						    }
						    fileWriter.write(fileBlob);
					    },
					    dfd.reject);
			    }
		    } catch (error) {
			    onFileError(e, "writeFileEntry:failed on write of data");
			    dfd.reject(error);
		    }
		    return dfd.promise();
	    },

	    write = function (fileName, data) {
		    return getFileSystem()
			    .then(function(fileSystem) {
				    return getFile(fileSystem, fileName);
			    })
			    .then(function(fileEntry) {
				    return writeFileEntry(fileEntry, data);
			    })
			    .fail(e => onFileError(e, 'write:failed to write to file ' + fileName));
	    },

	    readFileEntry = function(fileEntry, defaultValue) {
		    var dfd = deferred();
		    try {
			    app.log("Reading File Entry");

			    fileEntry.file(function(file) {
					    var reader = new FileReader();

					    reader.onload = function() {
					    	app.log("File Read Succeeded");

					    	if ((typeof defaultValue !== "undefined") && (reader.result === null || reader.result.length === 0)) {
							    app.warn("File contents are zero-length string; using default value");
							    dfd.resolve(defaultValue);
							    return;
						    }

						    try {
							    var result = tryParseJSON(reader.result);
							    dfd.resolve(result.json || defaultValue, fileEntry);
						    } catch (error) {
							    onFileError(error, "readFileEntry:Failed to parse JSON file " + fileEntry.fullPath.toString());
							    dfd.reject(error);
						    }
					    };

					    reader.onerror = function(e) {
						    app.log("File Read Failed");
						    onFileError(e, "readFileEntry:failed on read of data for file " + fileEntry.fullPath.toString());
						    dfd.reject(e);
					    };

					    reader.readAsText(file);

				    },
				    dfd.reject);
		    } catch (error) {
			    dfd.reject(error);
		    }
		    return dfd.promise();
	    },

	    read = function (fileName, defaultValue) {
		    return getFileSystem()
			    .then(function(fileSystem) {
				    return getFile(fileSystem, fileName);
			    })
			    .then(function(fileEntry) {
				    return readFileEntry(fileEntry, defaultValue);
			    })
			    .fail(e => onFileError(e, 'read:failed to read file ' + fileName));
	    },

	    removeFileEntry = function(fileEntry) {
		    var dfd = deferred();
		    try {
			    app.log("Removing File Entry");

			    fileEntry.remove(function() {
					    app.log('File Remove Succeeded.');
					    dfd.resolve();
				    },
				    function(e) {
					    app.log("File Remove Failed");
					    onFileError(e, "removeFileEntry:failed to remove file " + fileEntry.fullPath.toString());
					    dfd.reject(e);
				    }
			    );
		    } catch (error) {
			    onFileError(e, "removeFileEntry:failed to remove file " + fileEntry.fullPath.toString());
			    dfd.reject(error);
		    }
		    return dfd.promise();
	    },

	    remove = function(fileName) {
		    return getFileSystem()
			    .then(function(fileSystem) {
				    return getFile(fileSystem, fileName);
			    })
			    .then(function(fileEntry) {
				    return removeFileEntry(fileEntry);
			    })
			    .fail(e => onFileError(e, 'remove:failed to remove file ' + fileName));
	    },

	    //initialize the quota and verify the file system operations
	    initializeAndVerifyFile = function() {
		    getStorageQuota(requestedBytes)
			    .then(getFileSystem)
			    .then(function(fileSystem) {
				    return getFile(fileSystem, "fileInitializeVerification.txt");
			    })
			    .then(function(fileEntry) {
				    return writeFileEntry(fileEntry, { "Verified": true })
					    .then(() => readFileEntry(fileEntry))
					    .then(() => removeFileEntry(fileEntry));
			    })
			    .done(function() {
				    app.log("fileStorage.js initialized");
				    initializedDeferred.resolve();
			    })
			    .fail(function(e) {
				    onFileError(e, "initializeAndVerifyFile:filestorage initialization failed");
				    initializedDeferred.reject(e);
			    });
	    },

	    //only initialize the file system quota
	    initializeQuota = function() {
		    getStorageQuota(requestedBytes)
			    .done(function() {
				    app.log("fileStorage.js initialized");
				    initializedDeferred.resolve();
			    })
			    .fail(function(e) {
				    onFileError(e, "initializeQuota:filestorage initialization failed");
				    initializedDeferred.reject(e);
			    });
	    };

	if (verifyFileOperationsOnInitialization) {
		initializeAndVerifyFile();
	} else {
		initializeQuota();
	}

	return {
		initialized: initialized,
		get: read,
		set: write,
		remove: remove,
		type: 'fileStorage'
	};
})(jQuery.Deferred, app.eventsMobileSettings.dataFilePersistence, app.eventsMobileSettings.dataFileMaxMegabytes);