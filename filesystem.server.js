var fs = Npm.require('fs');
var path = Npm.require('path');
var mkdirp = Npm.require('mkdirp');
var chokidar = Npm.require('chokidar');

FS.Store.FileSystem = function(name, options) {
  var self = this;
  if (!(self instanceof FS.Store.FileSystem))
    throw new Error('FS.Store.FileSystem missing keyword "new"');

  // We allow options to be string/path empty or options.path
  options = (options !== ''+options) ? options || {} : { path: options };

  // Provide a default FS directory one level up from the build/bundle directory
  var pathname = options.path;
  if (!pathname && __meteor_bootstrap__ && __meteor_bootstrap__.serverDir) {
    pathname = path.join(__meteor_bootstrap__.serverDir, '../../../cfs/files/' + name);
  }

  if (!pathname)
    throw new Error('FS.Store.FileSystem unable to determine path');

  // Check if we have '~/foo/bar'
  if (pathname.split(path.sep)[0] === '~') {
    var homepath = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
    if (homepath) {
      pathname = pathname.replace('~', homepath);
    } else {
      throw new Error('FS.Store.FileSystem unable to resolve "~" in path');
    }
  }

  // Set absolute path
  var absolutePath = path.resolve(pathname);

  // Ensure the path exists
  mkdirp.sync(absolutePath);
  FS.debug && console.log(name + ' FileSystem mounted on: ' + absolutePath);

  return new FS.StorageAdapter(name, options, {
    typeName: 'storage.filesystem',

    getStream: function(fileObj, callback) {
      var fileInfo = fileObj.getCopyInfo(name);
      if (!fileInfo) { return callback(null, null); }
      var fileKey = fileInfo.key;

      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      // Call node createReadStream
      callback(null, fs.createReadStream(filepath));
    },
    get: function(fileObj, callback) {
      var fileInfo = fileObj.getCopyInfo(name);
      if (!fileInfo) { return callback(null, null); }
      var fileKey = fileInfo.key;

      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      // Call node readFile
      fs.readFile(filepath, callback);
    },
    getBytes: function(fileObj, start, end, callback) {
      var fileInfo = fileObj.getCopyInfo(name);
      if (!fileInfo) { return callback(null, null); }
      var fileKey = fileInfo.key;

      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      // Call node readFile
      if (typeof start === "number" && typeof end === "number") {
        var size = end - start;
        var buffer = new Buffer(size);
        //open file for reading
        fs.open(filepath, 'r', function(err, fd) {
          if (err)
            callback(err);
          //read bytes
          fs.read(fd, buffer, 0, size, start, function(err, bytesRead, buffer) {
            if (err)
              callback(err);
            fs.close(fd, function(err) {
              if (err)
                FS.debug && console.log("FileSystemStore getBytes: Error closing file");
              callback(null, buffer);
            });
          });
        });
      } else {
        callback(new Error('FileSystemStore getBytes: Invalid start or stop values'));
      }
    },

    putStream: function(fileObj, options, callback) {
      options = options || {};

      var fileKey = fileObj.collectionName + '-' + fileObj._id + '-' + fileObj.name;
      var inputStream = fileObj.getStream();

      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      if (!options.overwrite) {
        // Change filename if necessary so that we can write to a new file
        var extension = path.extname(fileKey);
        var fn = fileKey.substr(0, fileKey.length - extension.length);
        var suffix = 0;
        while (fs.existsSync(filepath)) {
          suffix++;
          fileKey = fn + suffix + extension; //once we exit the loop, this is what will actually be used
          filepath = path.join(absolutePath, fileKey);
        }
      }

      outputStream = inputStream.pipe(fs.createWriteStream(filepath));

      outputStream.on('finish', function () {
        callback(null, newFileKey);
      });

      outputStream.on('error', function (err) {
        return callback(err);
      });

    },

    put: function(fileObj, options, callback) {
      options = options || {};

      var fileKey = fileObj.collectionName + '-' + fileObj._id + '-' + fileObj.name;
      var buffer = fileObj.getBuffer();

      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      if (!options.overwrite) {
        // Change filename if necessary so that we can write to a new file
        var extension = path.extname(fileKey);
        var fn = fileKey.substr(0, fileKey.length - extension.length);
        var suffix = 0;
        while (fs.existsSync(filepath)) {
          suffix++;
          fileKey = fn + suffix + extension; //once we exit the loop, this is what will actually be used
          filepath = path.join(absolutePath, fileKey);
        }
      }

      // Call node writeFile
      fs.writeFile(filepath, buffer, function(err) {
        if (err) {
          callback(err);
        } else {
          callback(null, fileKey);
        }
      });
    },
    del: function(fileObj, callback) {
      var fileInfo = fileObj.getCopyInfo(name);
      if (!fileInfo) { return callback(null, true); }
      var fileKey = fileInfo.key;

      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      // Call node unlink file
      fs.unlink(filepath, callback);
    },
    stats: function(fileKey, callback) {
      // this is the Storage adapter scope
      var filepath = path.join(absolutePath, fileKey);

      fs.stat(filepath, callback);
    },
    watch: function(callback) {
      function fileKey(filePath) {
        return filePath.replace(absolutePath, "");
      }

      FS.debug && console.log('Watching ' + absolutePath);

      // chokidar seems to be most widely used and production ready watcher
      var watcher = chokidar.watch(absolutePath, {ignored: /\/\./, ignoreInitial: true});
      watcher.on('add', Meteor.bindEnvironment(function(filePath, stats) {
        callback("change", fileKey(filePath), {
          name: path.basename(filePath),
          type: null,
          size: stats.size,
          utime: stats.mtime
        });
      }, function(err) {
        throw err;
      }));
      watcher.on('change', Meteor.bindEnvironment(function(filePath, stats) {
        callback("change", fileKey(filePath), {
          name: path.basename(filePath),
          type: null,
          size: stats.size,
          utime: stats.mtime
        });
      }, function(err) {
        throw err;
      }));
      watcher.on('unlink', Meteor.bindEnvironment(function(filePath) {
        callback("remove", fileKey(filePath));
      }, function(err) {
        throw err;
      }));
    }
  });
};
