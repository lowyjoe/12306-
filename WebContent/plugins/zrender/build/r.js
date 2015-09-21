/**
 * @license r.js 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*
 * This is a bootstrap script to allow running RequireJS in the command line
 * in either a Java/Rhino or Node environment. It is modified by the top-level
 * dist.js file to inject other files to completely enable this file. It is
 * the shell of the r.js file.
 */

/*jslint evil: true, nomen: true, sloppy: true */
/*global readFile: true, process: false, Packages: false, print: false,
console: false, java: false, module: false, requirejsVars, navigator,
document, importScripts, self, location, Components, FileUtils */

var requirejs, require, define, xpcUtil;
(function (console, args, readFileFunc) {
    var fileName, env, fs, vm, path, exec, rhinoContext, dir, nodeRequire,
        nodeDefine, exists, reqMain, loadedOptimizedLib, existsForNode, Cc, Ci,
        version = '2.1.8',
        jsSuffixRegExp = /\.js$/,
        commandOption = '',
        useLibLoaded = {},
        //Used by jslib/rhino/args.js
        rhinoArgs = args,
        //Used by jslib/xpconnect/args.js
        xpconnectArgs = args,
        readFile = typeof readFileFunc !== 'undefined' ? readFileFunc : null;

    function showHelp() {
        console.log('See https://github.com/jrburke/r.js for usage.');
    }

    if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
            (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'browser';

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (string) {
            return eval(string);
        };

        exists = function () {
            console.log('x.js exists not applicable in browser env');
            return false;
        };

    } else if (typeof Packages !== 'undefined') {
        env = 'rhino';

        fileName = args[0];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = args[1];
        }

        //Set up execution context.
        rhinoContext = Packages.org.mozilla.javascript.ContextFactory.getGlobal().enterContext();

        exec = function (string, name) {
            return rhinoContext.evaluateString(this, string, name, 0, null);
        };

        exists = function (fileName) {
            return (new java.io.File(fileName)).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
            console = {
                log: function () {
                    print.apply(undefined, arguments);
                }
            };
        }
    } else if (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
        env = 'node';

        //Get the fs module via Node's require before it
        //gets replaced. Used in require/node.js
        fs = require('fs');
        vm = require('vm');
        path = require('path');
        //In Node 0.7+ existsSync is on fs.
        existsForNode = fs.existsSync || path.existsSync;

        nodeRequire = require;
        nodeDefine = define;
        reqMain = require.main;

        //Temporarily hide require and define to allow require.js to define
        //them.
        require = undefined;
        define = undefined;

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (string, name) {
            return vm.runInThisContext(this.requirejsVars.require.makeNodeWrapper(string),
                                       name ? fs.realpathSync(name) : '');
        };

        exists = function (fileName) {
            return existsForNode(fileName);
        };


        fileName = process.argv[2];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = process.argv[3];
        }
    } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect';

        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        Cc = Components.classes;
        Ci = Components.interfaces;

        fileName = args[0];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = args[1];
        }

        xpcUtil = {
            cwd: function () {
                return FileUtils.getFile("CurWorkD", []).path;
            },

            //Remove . and .. from paths, normalize on front slashes
            normalize: function (path) {
                //There has to be an easier way to do this.
                var i, part, ary,
                    firstChar = path.charAt(0);

                if (firstChar !== '/' &&
                        firstChar !== '\\' &&
                        path.indexOf(':') === -1) {
                    //A relative path. Use the current working directory.
                    path = xpcUtil.cwd() + '/' + path;
                }

                ary = path.replace(/\\/g, '/').split('/');

                for (i = 0; i < ary.length; i += 1) {
                    part = ary[i];
                    if (part === '.') {
                        ary.splice(i, 1);
                        i -= 1;
                    } else if (part === '..') {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
                return ary.join('/');
            },

            xpfile: function (path) {
                try {
                    return new FileUtils.File(xpcUtil.normalize(path));
                } catch (e) {
                    throw new Error(path + ' failed: ' + e);
                }
            },

            readFile: function (/*String*/path, /*String?*/encoding) {
                //A file read function that can deal with BOMs
                encoding = encoding || "utf-8";

                var inStream, convertStream,
                    readData = {},
                    fileObj = xpcUtil.xpfile(path);

                //XPCOM, you so crazy
                try {
                    inStream = Cc['@mozilla.org/network/file-input-stream;1']
                               .createInstance(Ci.nsIFileInputStream);
                    inStream.init(fileObj, 1, 0, false);

                    convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                    .createInstance(Ci.nsIConverterInputStream);
                    convertStream.init(inStream, encoding, inStream.available(),
                    Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                    convertStream.readString(inStream.available(), readData);
                    return readData.value;
                } catch (e) {
                    throw new Error((fileObj && fileObj.path || '') + ': ' + e);
                } finally {
                    if (convertStream) {
                        convertStream.close();
                    }
                    if (inStream) {
                        inStream.close();
                    }
                }
            }
        };

        readFile = xpcUtil.readFile;

        exec = function (string) {
            return eval(string);
        };

        exists = function (fileName) {
            return xpcUtil.xpfile(fileName).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
            console = {
                log: function () {
                    print.apply(undefined, arguments);
                }
            };
        }
    }

    /** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */


(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.8',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value !== 'string') {
                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; ary[i]; i += 1) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                        //path segment at the front so it can be mapped
                        //correctly to disk. Otherwise, there is likely
                        //no path mapping for a path starting with '..'.
                        //This can still fail, but catches the most reasonable
                        //uses of ..
                        break;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgName, pkgConfig, mapValue, nameParts, i, j, nameSegment,
                foundMap, foundI, foundStarMap, starI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name && name.charAt(0) === '.') {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    if (getOwn(config.pkgs, baseName)) {
                        //If the baseName is a package name, then just treat it as one
                        //name to concat the name with.
                        normalizedBaseParts = baseParts = [baseName];
                    } else {
                        //Convert baseName to array, and lop off the last part,
                        //so that . matches that 'directory' and not name of the baseName's
                        //module. For instance, baseName of 'one/two/three', maps to
                        //'one/two/three.js', but we want the directory, 'one/two' for
                        //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    }

                    name = normalizedBaseParts.concat(name.split('/'));
                    trimDots(name);

                    //Some use of packages may use a . path to reference the
                    //'main' module name, so normalize for that.
                    pkgConfig = getOwn(config.pkgs, (pkgName = name[0]));
                    name = name.join('/');
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.main) {
                        name = pkgName;
                    }
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break;
                                }
                            }
                        }
                    }

                    if (foundMap) {
                        break;
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            return name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                removeScript(id);
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);
                context.require([id]);
                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        normalizedName = normalize(name, parentName, applyMap);
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length - 1, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return mod.exports;
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            var c,
                                pkg = getOwn(config.pkgs, mod.map.id);
                            // For packages, only support config targeted
                            // at the main module.
                            c = pkg ? getOwn(config.config, mod.map.id + '/' + pkg.main) :
                                      getOwn(config.config, mod.map.id);
                            return  c || {};
                        },
                        exports: defined[mod.map.id]
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var map, modId, err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                map = mod.map;
                modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            if (this.map.isDefine) {
                                //If setting exports via 'module' is in play,
                                //favor that over return value and exports. After that,
                                //favor a non-undefined return value over exports use.
                                cjsModule = this.module;
                                if (cjsModule &&
                                        cjsModule.exports !== undefined &&
                                        //Make sure it is not already the exports value
                                        cjsModule.exports !== this.exports) {
                                    exports = cjsModule.exports;
                                } else if (exports === undefined && this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths and packages since they require special processing,
                //they are additive.
                var pkgs = config.pkgs,
                    shim = config.shim,
                    objs = {
                        paths: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (prop === 'map') {
                            if (!config.map) {
                                config.map = {};
                            }
                            mixin(config[prop], value, true, true);
                        } else {
                            mixin(config[prop], value, true);
                        }
                    } else {
                        config[prop] = value;
                    }
                });

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;
                        location = pkgObj.location;

                        //Create a brand new object on pkgs, since currentPackages can
                        //be passed in again, and config.pkgs is the internal transformed
                        //state for all package configs.
                        pkgs[pkgObj.name] = {
                            name: pkgObj.name,
                            location: location || pkgObj.name,
                            //Remove leading dot in main, so main paths are normalized,
                            //and remove any trailing .js, since different package
                            //envs have different conventions: some use a module name,
                            //some use a file name.
                            main: (pkgObj.main || 'main')
                                  .replace(currDirRegExp, '')
                                  .replace(jsSuffixRegExp, '')
                        };
                    });

                    //Done with modifications, assing packages back to context config
                    config.pkgs = pkgs;
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overriden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, pkgs, pkg, pkgPath, syms, i, parentModule, url,
                    parentPath;

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;
                    pkgs = config.pkgs;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');
                        pkg = getOwn(pkgs, parentModule);
                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        } else if (pkg) {
                            //If module name is just the package name, then looking
                            //for the main module.
                            if (moduleName === pkg.name) {
                                pkgPath = pkg.location + '/' + pkg.main;
                            } else {
                                pkgPath = pkg.location;
                            }
                            syms.splice(0, i, pkgPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));



    this.requirejsVars = {
        require: require,
        requirejs: require,
        define: define
    };

    if (env === 'browser') {
        /**
 * @license RequireJS rhino Copyright (c) 2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

//sloppy since eval enclosed with use strict causes problems if the source
//text is not strict-compliant.
/*jslint sloppy: true, evil: true */
/*global require, XMLHttpRequest */

(function () {
    require.load = function (context, moduleName, url) {
        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
        xhr.send();

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                eval(xhr.responseText);

                //Support anonymous modules.
                context.completeLoad(moduleName);
            }
        };
    };
}());
    } else if (env === 'rhino') {
        /**
 * @license RequireJS rhino Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*jslint */
/*global require: false, java: false, load: false */

(function () {
    'use strict';
    require.load = function (context, moduleName, url) {

        load(url);

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

}());
    } else if (env === 'node') {
        this.requirejsVars.nodeRequire = nodeRequire;
        require.nodeRequire = nodeRequire;

        /**
 * @license RequireJS node Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*jslint regexp: false */
/*global require: false, define: false, requirejsVars: false, process: false */

/**
 * This adapter assumes that x.js has loaded it and set up
 * some variables. This adapter just allows limited RequireJS
 * usage from within the requirejs directory. The general
 * node adapater is r.js.
 */

(function () {
    'use strict';

    var nodeReq = requirejsVars.nodeRequire,
        req = requirejsVars.require,
        def = requirejsVars.define,
        fs = nodeReq('fs'),
        path = nodeReq('path'),
        vm = nodeReq('vm'),
        //In Node 0.7+ existsSync is on fs.
        exists = fs.existsSync || path.existsSync,
        hasOwn = Object.prototype.hasOwnProperty;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function syncTick(fn) {
        fn();
    }

    //Supply an implementation that allows synchronous get of a module.
    req.get = function (context, moduleName, relModuleMap, localRequire) {
        if (moduleName === "require" || moduleName === "exports" || moduleName === "module") {
            req.onError(new Error("Explicit require of " + moduleName + " is not allowed."));
        }

        var ret, oldTick,
            moduleMap = context.makeModuleMap(moduleName, relModuleMap, false, true);

        //Normalize module name, if it contains . or ..
        moduleName = moduleMap.id;

        if (hasProp(context.defined, moduleName)) {
            ret = context.defined[moduleName];
        } else {
            if (ret === undefined) {
                //Make sure nextTick for this type of call is sync-based.
                oldTick = context.nextTick;
                context.nextTick = syncTick;
                try {
                    if (moduleMap.prefix) {
                        //A plugin, call requirejs to handle it. Now that
                        //nextTick is syncTick, the require will complete
                        //synchronously.
                        localRequire([moduleMap.originalName]);

                        //Now that plugin is loaded, can regenerate the moduleMap
                        //to get the final, normalized ID.
                        moduleMap = context.makeModuleMap(moduleMap.originalName, relModuleMap, false, true);
                        moduleName = moduleMap.id;
                    } else {
                        //Try to dynamically fetch it.
                        req.load(context, moduleName, moduleMap.url);

                        //Enable the module
                        context.enable(moduleMap, relModuleMap);
                    }

                    //Break any cycles by requiring it normally, but this will
                    //finish synchronously
                    require([moduleName]);

                    //The above calls are sync, so can do the next thing safely.
                    ret = context.defined[moduleName];
                } finally {
                    context.nextTick = oldTick;
                }
            }
        }

        return ret;
    };

    req.nextTick = function (fn) {
        process.nextTick(fn);
    };

    //Add wrapper around the code so that it gets the requirejs
    //API instead of the Node API, and it is done lexically so
    //that it survives later execution.
    req.makeNodeWrapper = function (contents) {
        return '(function (require, requirejs, define) { ' +
                contents +
                '\n}(requirejsVars.require, requirejsVars.requirejs, requirejsVars.define));';
    };

    req.load = function (context, moduleName, url) {
        var contents, err,
            config = context.config;

        if (config.shim[moduleName] && (!config.suppress || !config.suppress.nodeShim)) {
            console.warn('Shim config not supported in Node, may or may not work. Detected ' +
                            'for module: ' + moduleName);
        }

        if (exists(url)) {
            contents = fs.readFileSync(url, 'utf8');

            contents = req.makeNodeWrapper(contents);
            try {
                vm.runInThisContext(contents, fs.realpathSync(url));
            } catch (e) {
                err = new Error('Evaluating ' + url + ' as module "' +
                                moduleName + '" failed with error: ' + e);
                err.originalError = e;
                err.moduleName = moduleName;
                err.fileName = url;
                return req.onError(err);
            }
        } else {
            def(moduleName, function () {
                //Get the original name, since relative requires may be
                //resolved differently in node (issue #202). Also, if relative,
                //make it relative to the URL of the item requesting it
                //(issue #393)
                var dirName,
                    map = hasProp(context.registry, moduleName) &&
                            context.registry[moduleName].map,
                    parentMap = map && map.parentMap,
                    originalName = map && map.originalName;

                if (originalName.charAt(0) === '.' && parentMap) {
                    dirName = parentMap.url.split('/');
                    dirName.pop();
                    originalName = dirName.join('/') + '/' + originalName;
                }

                try {
                    return (context.config.nodeRequire || req.nodeRequire)(originalName);
                } catch (e) {
                    err = new Error('Tried loading "' + moduleName + '" at ' +
                                     url + ' then tried node\'s require("' +
                                        originalName + '") and it failed ' +
                                     'with error: ' + e);
                    err.originalError = e;
                    err.moduleName = originalName;
                    return req.onError(err);
                }
            });
        }

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

    //Override to provide the function wrapper for define/require.
    req.exec = function (text) {
        /*jslint evil: true */
        text = req.makeNodeWrapper(text);
        return eval(text);
    };
}());

    } else if (env === 'xpconnect') {
        /**
 * @license RequireJS xpconnect Copyright (c) 2013, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*jslint */
/*global require, load */

(function () {
    'use strict';
    require.load = function (context, moduleName, url) {

        load(url);

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

}());

    }

    //Support a default file name to execute. Useful for hosted envs
    //like Joyent where it defaults to a server.js as the only executed
    //script. But only do it if this is not an optimization run.
    if (commandOption !== 'o' && (!fileName || !jsSuffixRegExp.test(fileName))) {
        fileName = 'main.js';
    }

    /**
     * Loads the library files that can be used for the optimizer, or for other
     * tasks.
     */
    function loadLib() {
        /**
 * @license Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*jslint strict: false */
/*global Packages: false, process: false, window: false, navigator: false,
  document: false, define: false */

/**
 * A plugin that modifies any /env/ path to be the right path based on
 * the host environment. Right now only works for Node, Rhino and browser.
 */
(function () {
    var pathRegExp = /(\/|^)env\/|\{env\}/,
        env = 'unknown';

    if (typeof Packages !== 'undefined') {
        env = 'rhino';
    } else if (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
        env = 'node';
    } else if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
            (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'browser';
    } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect';
    }

    define('env', {
        get: function () {
            return env;
        },

        load: function (name, req, load, config) {
            //Allow override in the config.
            if (config.env) {
                env = config.env;
            }

            name = name.replace(pathRegExp, function (match, prefix) {
                if (match.indexOf('{') === -1) {
                    return prefix + env + '/';
                } else {
                    return env;
                }
            });

            req([name], function (mod) {
                load(mod);
            });
        }
    });
}());/**
 * @license Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */

/*jslint plusplus: true */
/*global define */

define('lang', function () {
    'use strict';

    var lang,
        hasOwn = Object.prototype.hasOwnProperty;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    lang = {
        backSlashRegExp: /\\/g,
        ostring: Object.prototype.toString,

        isArray: Array.isArray || function (it) {
            return lang.ostring.call(it) === "[object Array]";
        },

        isFunction: function(it) {
            return lang.ostring.call(it) === "[object Function]";
        },

        isRegExp: function(it) {
            return it && it instanceof RegExp;
        },

        hasProp: hasProp,

        //returns true if the object does not have an own property prop,
        //or if it does, it is a falsy value.
        falseProp: function (obj, prop) {
            return !hasProp(obj, prop) || !obj[prop];
        },

        //gets own property value for given prop on object
        getOwn: function (obj, prop) {
 8 Copyrightreturn hasPropense r.js 2.&& obj[.js ];.8 Copyri},
.8 Copyri_mixin/**
 * @li(dest, source, override)1.8 Copyright var name Rights Rerke/for (thub inr new B2.1.8 Copyright is iif( new B.hasOwn012,ertyrejs )*/

/*
 * This is in && ( license || !MIT rap script to allow r)s
 */

/*
 * This is It MIT [thub] =r new Bdified.com/jrburke/rs Res.8 Copyright }rved.
 * Aght (c) 201MIT ; // ObjectRights Reserved.
 * A/**.8 Copyrig* ailab({},dati1

/*j2) is allowed. If the last argumentil: t boolean,f the r.js fthen: tru new Bdatiectsr.js erties arerequce copiedD lic toy ena.f the r.js /.8 Copyriailable via the MIT .
 * see: http://giparameters = Array.prototype.slice.call(oppy: trs)l readFile:*/

var license, i, l;r files to comif ( * in) {y ena = {};her files to compcUtument, imp.length > 2the lf, ofloppy: trs[unc) {
    var fi-1] === '/*globa's
 */

/*
 * This isommand li=cument, imp.pop().com/jrburke/rer files to comequiri = 1, lists, reqMain,var fi; i < l; i++s
 */

/*
 * This islang.vailab MIT orument, imp[i]SD license.edOptimizedLib, files to completely enable this file. It is
 * the sheldelegate: (*
 * @lice2.1.8 Copyright //
/*gdman/crockfordArgs = a@licw/ corn
    optimizpconnexistsForNode,
 * @licTMP//Us {},
        //Used b*
 * @license r.js ss
 */

/*
 * This isTMPts, self,  =datiel
 * dist.js file//gitmp = newFileFuel
 * dist.js filep() {
        conullel
 * dist.js fileileFul;

    function showHel /\.js$/,      tmpnull;

 el
 * dist.js file to inject othght (c) 201tmpble this file. It isdLib, Rights Res()) * the shell of the r.js fHelpereadFileFunequiiterating
consoan acriptmen: trueof  (c) 20sf the r.js fa true valujs, t will break out on: trueoopse, java: false, moduleach/**
 * @lic   r(ary,rn fs2.1.8 Copyright pcUtarys
 */

/*
 * This is//giiel
 * dist.js file, Cc, Ci,08',
  ary= '2.1.8',
+= 1ned' && typeof document pcUteof ts == '',i,plicor Node environment. It ikage     el
 * dist.js fileeof importScripts !==  to inject othere. It is
 * the shell of the r.js fCycles
consokages: falsin
   lse, P and n, C */
eadFile = fun   rf the r.js fkages: y);
       return fsconnereadFil 'utf8th       ,true, prof the r.js fction (onil: stoppedn (string) {
            r012,eturn eval(stri012, The D       };

        e
docurop.com/jrburke/requirtext ===objs
 */

/*
 * This is a (0-2012, The Dojo F env');
            return false;ation AllrhinoContext.evaluateString(thiages !== 'undefined') {
        env = 'rhino';

        fileName = args[0];

        i/Simil/gito Fme = arts, self, lbind, but: tru"this") {
        pecified.exists();
firT or ince    is easinsole:read/figure  exewhatfor easi};

  ese, java:  con/**
 * @lic conxtFacton2.1.8 Copyright (c) 201
        //Used by jslib/xon () {
    n.applyense rmponents, edOptimizedLib, Rights Reserved.
 * A//Escapalse cont trustr(patto be= 'uaprocess ! 'unhas charac impoeelse         //getfuncnclust.
 asmandxec =a JSprocessse, java: js else /**
 * @licetypeof 2.1.8 Copyright (c) 201typeof .replace(/(["'\\])/g, '\\$1'running RequireJS s replaced[\f]n re"\\f"node.js
        fs = require('bs');
   b    vm = require('vm');
       ns');
   n    vm = require('vm');
       ts');
   t    vm = require('vm');
       rs');
   r"        }
 e = ar       (c) 201js$/;
});
l of ing(im 0.0.1 Copyright (c) 2012-2013, The Dojo Foundext.
 All RqMais ReservhinoC* Available via: truMIT orcom/jBSD catins    * see: http://github.com/requirejs/fine;s.nodetails
fals
/*global setImmediate r.jscess,
   Timeout, define, module= unde/Setefinee.hideResoluxt.
Conflicn (ctf8')to true, "r(path, 'u-races"
//inntexmise-tests};

pass.rn fthoug trugoalec =fine;i     ndefinmall impl     trusted coejs, .
  
//moreVarsortant};

norrejsy throw ===r ea casoces& procwe can find
//logic errors quicker.

rConteim;
,
        //Used by'u  natrict' Right//gioub.chis fits, self, l readFileap scr conprap script to auire, deof readF0-2012, The Dojo Fo1.8 Copyri(c) 2010-2Ownon, Conse r.js 2 Righter filel of the         readFile = function (path) {
            return fs.readFileSync(, 'utf8');
        };

        exec = function (strialse, murn eval(string);
        };

     xists = function () {
        console.log(s exists not applicable in browser env');
            xists =[i]ned' && typeof document alse;
        };

  el
 * dist.js file to inject otherodeRequire = reeName = processcheck(   if (fileNa        retup, 'e')ine
leName && fiv'ontext.evaluateStpcUti    leSync(path, 'utf8');
        print.apply(u      om/jE '')('nope' useLibLoaded = {},
        //Used bfalsb.com/jrburnterfaces;'undefinrub.com/j    fileName = anotifyng);
 ;
     if (fileNammandnextTick,
        //Used by jslib/xstring);
      @liceitems
 */

/*
 * This is tem(rWorkDedOptimizedLib,  nodeRequir=== 0) {
     fine;=ined' && C    //Used by jsl
docuFileUtils */

ok = []FileUtils */

fai    []uire, defin(c) 201(ub.c1.8 Copyright n, Cback/**
 * @liceyes, noport']('resource://gre/m       if (firstChar !     .errchar'/' el
 * dist.js file ting, name) {
            retu'-') === 0) {
         []).path;
            },

            //Remove . working diryes(p.vr !== '\\' &&
     ize: function (pcwd: func elsese the current working ok.push    lasses;
        Ci = Components.inerved.
 * Ave .  first/**
 * @lice       if (firstChar !== 'leName && fileN== -1) {
                    //A relative path. Use the current working direno(p.      normalize:     path = xpcUtil.cwd() + '/' + path;
                }, pa      har !== '\\' &&
       lace(/\\/g, '/').split('/');finishesole = {
           print.apply(undefineleName && fileName.indexOf('-') ==edOptimizedLib,/').split('/');ree, Psplice(i - 1, 2);
                        i -= 2;
                   }
                rsolv module via Nvport']('resource://gre/mrgs[0];
 &&
                      v = v                   pat.getFilok, 
                   importScripts !== 'undefit();

        e}FileUtils */

 retur/**
 * @licels
 */

/*
 * This is aUtils.File(xpcUtil.normalize(path));  cob.com/jrburke/rcatch (e) {
   , pa,               ary.spew Error(path + ' failed: ' + e);
         ..') {
      star    },

        log: function (       try {
rke/r.js for usage.'failed: ts, name.rue,   vencoding = encoding || "utf-8"= {},
 :ring(1);
            eble via the              if (firstChar !ttp://gitexn (chas touire, define, x          ath.char,
        /        return new Fi         ryse the current working dire       cyesme, env, fssIFi dir,eof readquire,
        nodeDection () {
       =ector
                    patmizedLib, existsForNode']('resource://gre/mvthe v     Use the current working dire an easie          Stream,
,     . retur
                    convertStre/' + path;
                }  } catch (e) .createIns;

                    convertStreaonvertStream.init(inStre} catch         readFile: func(inStream, encodinge, P(              ary.spliceeal with BOMs
                },

            readFile: func an easier werr  inStream = Cc['@mozil                      .createInstance(Ci.n!noine
env, fsno !
                    inStream.init(fileObj, 1, 0,                  convertStream.readStri               convertStream.init(inStream, eerr if o     m;1']
                           tionrtSt&&ertSut-stream;1']
                           onvertS        .createInstance(Ci.nsIConverterInputStream);
                        convertStream.init(inStream, e       } fi, inSterr
                }
            }
                       if (conver     Ci.nsIConverterInputStream.DEF2ream;1']
                                    2     convertStream.readString(inStream.available()lose();
                (c) 201ncodi= {},
 = xpcUtil.cwd() + 'ding || "utf-8"                   for (i = 0; i < ary.len    readData = {},
        ((t     t fancy though.
        if (typeof conensole = {
    Use the current working     firstCreadData);
                    return r      et fancy though.
   path = xpcUtil.cwd() + ' Components.interfaces;
=== 0) {ose();
mmandseria    *
 * @lices = function ()//giresul          Stream,
      //get fancy th and .. from paths, normalize on front sthe MIT othe MI       e(i - 1, 2);
                       es
       normalize: function (path) {
 ing. Don't
the MIhe Dojo Foundation             nv, fs        read);
             ?.
/*jslint reg:     Ci.n(strict.le = fuj && fun{
    d'    le = fu may not b? = xpcUtil.xpfilimportScripts,:
/*globaltion (path, navigator, docu setTimeout, odefined' && C   var inStream, convertion (path(fn, 0           fileO               var inStreamfn92, and })lose();
tionstrict.{
    gexp: true, nome&&tRegExp.amd  if (fileNa{
    ('    ', readData);funcfailed:     , The Dojo/' + p    comment      r navigator, documen      .ex    
    functionuffixRegExp =              re{
  ;
if(env, dir, rowserquirene = de@e
      RundefiJS    reqMain = requiin;

        //Temporarily hide require and define to allow require.js to define
        //them.
        require =jrburke= undefine      define = undefjslif proce          'unefined;

{
    t),
   , loasole
       
//Ju slo stubect';ileNwith uglify's   /solidator.js
)/mg,
  ct.prot/assert  cjsRequireRegEuire;
      {}deDefi
}
    op = ObjenodleNape,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && window.document),
        isWebWorker = !isBrowser && typeof importNeededname ? fsrhinoete, buealpa(c) 201ts !== 'unde       //PS3 indicates loaded anSequete, but n['te, but], readData);te, but for complete
te, bu      //specifically. complotype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded ancomplete|loat need to wait for complete
        //specifically. xpconnectence is 'loading', 'loaded', execution,
        ain;

        //Temporarily hide require and define to allow require.js to define
        //them.
        require =dow !== 'undefined' && navigator && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded anng over aete, but need to wait for complete
        //specifically. ct.prototype,
        ostrin   reqMain = requ0re.m1 it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[ipera */ typeof impooaded and completrgst need to wait for co//Always exp    configllow an APIpath.uire;
       ary    //specifically. Sequence is 'loading', 'l     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)ragedy               break;
    D    t{
       g foSequ".js "tes ";
                 alue     ra */
argvlocati(e).ek;
    Ignng),any comm    s,
 ondefidect';main x.js branching
        alue[0]]*?)       .indexOf('-'));
  0  if (fileNaunc) {
alueprop;
 1=== 0) {
     for reasrgs       isOpera = typeof opera !== 'undefined' &&     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i],//gijsLibRomplAnc) {
 commentcomplvalue navigator, documen         Name.[].concat(Scripts, self, location, Components,Addi     === '[object A               break;
  j, func) {
function (valu     for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

   ng over an array. If the func    * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && f, ng over avaluesource, functXpCis easier t, prop) {
it is easier t navigator, documenit is easier target, prop)) {
                    if (deepStringMixin && typeof      }
    == 'string') {
                        i out what 'th     for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

   ct.prototype,
        ostring = op.toString,
        hatrue value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary/PS3 i !isBrowy[i], i, ary)) {
    r &&ectin./filea. See the usaaramt for coct: unever &&the eNow r  firstCharevalthe e.ypeoFilean ID on a           }
        r &&unction hasProp(obj, prop) {
        return has if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more infraged.
     * fs {String} id th
    functhat maps to an ID on a web page.
//gitypeof his'fsaram {StrSyncan ID on , 'utf8unction (pat        compStrireturn e, n ID on ae human readable error.
     * @param {Error} f opera !== 'undefined' && opera.toString() === '[objtrue value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (aryr && typeof impo === '[object .
     ct: uneven strict ble error.
     * @param {Error} ng over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
          };
    }

 for a require config object
    if (typeof require !== 'urray backwards. If the func
     * returns a sOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && navigator && window.doloppy:         m//XPtf8')    isWebWor undefi) {
      ter to , XMLHttpg = IT or undefine = ucext.
 [i], i, ary)) {
    aram ctin     . See the usa.]\sa we         araml readFilecurrDirRegExub.c/^\.(\/|$)/leName = processfrontSlash(path  if (fileName && f    s replaced\\n req/unction     fileName = aexists        //are reg//gistatus, xhStreaewonfig: {}
         inStream //Oh yeah   /a.
   eqMainSYNC IO. Behold its glory],
            horrio alblock(patbehaviorse, java: xhr.open('HEAD'mmanth,typeofction () {
izedsend92, and causvents  = * Trients ry,
               from an== 200ine
     * It w304         enabledRegistmkDir(dira web page.
ter to .log('l becxt(tno-unctioct.prototth segment if a .. will Fullbecome
         * the first path s  * whient, to help with module name lookupil  co1.8 Copyrichar
    /cycle: ivatedeb page.
 x) {
   tion shou^\./ook normalgetLineSeumentor(undefined, arguments);
    (c) 201'/
      s Reserved.
 * Ary = {              ID on a web page.
@param {Arrry = {}is already in ps Reserved.
 * Aparen               */
        function tr
docume e;
   ID on .split(
         ;
         tn, loadedOptimizedLibistered, rt =join               
 * the shell of the r.js fGe    he abpath,ell pat
       fined' &        izocess.versi: tro us(patdules s    eed' && (parsIES the sse, java: fa @ument {Socess}art = arye, java: false, modulabsPatreturn eval( ary[i]; i += 1) {
          dir= xpcUtil.cwd(tion      //cycle. {
 ing} messagar inStream, converdiStredules
             .hrefction () {
        tiondirj[prop], p/')n bin-r env');
            retu   //c    i];
             Ci.nsIConverterI//PulThisal witocol     hoT orjcripwanf self !== 'un          ;

      
   s (other build     a, lik//End of threasonable
   undefi._isSup    edB/useUrl dion iss      .
                     f  //URLs)sole.lmmanll'..' |from the most reasonable
   he roolse, java: fing for a pathing wce(0, 3..'.
                        loadedOptimizedLib for a path st'/' +     y.splice(i, 1);
   nvertStream = Cc['@mozilla.rt = ary start +art = ary[iubrocess         ject other files to completelyrt = ary Rights Reserved.
 * A
        ast one non-dot
                    ng} name the relative name
         *is{Str/**
 * @lice       //are reg() {
                e
         * to.
 Directory    * @param {Boolean} applyMap apply t       cwd: funcding || "utgetFiltere {StrLis    },

     ;

  Dir    ycle      s, makeUnixt le
    function shohe first path* @pa.
         * @returent, to help with module nam
               copyDi input array.srclizedMIT lized name
      , only   rNewnction normalize(name, baseName, arts, i,ent, to help with modulefig, mapValue, nameParts,        * @paramsrc{Str definMIT Parts = bafoundI, foundStarMap, starI,
                base{Str    var pkgName, pkgConfig, mapValue, namePal of the r.js fRethubcomma @pa Mayi, parif "to" alypeoy(ary) {.js is     n      driv           false, modulr
            * @param    , t      if (firstCh(name, baseName, ary to norm= map && map['*'];

            //Adjust any relative paths.
ad ===*text*     if have a base name, trym {Str    * @param {Bo, encodingi += 1) {
          {},
            defQueue = [],
                defined = {},
            urlFetched = {},
                requireCounter = 1,
            unnormalrmalizedCounteGET1;

        /**
             * Trims the {},
        //Used bizedresponseTexspiler 
               aseName)Async {
                    if (getOwn(config.pkgs, baseName)) {
            FileUtils */

var d           inStream = Cc with.
                   ction () {
    aseParts = baseParts = [bizedCnAt(0)y ofechangl nact: uneven strict support in btion];
   adySstan It w4 env');
            return farray of p > 40                        //so t        Name = args    us: dulewe want the+ 'rmalization.
       age humaream);
                    convertStream.init(inS    , inSt];
                                 pathenv = 'rhino';

        fileName baseParts = [baseNamed    //get fancy thependency IDsaveUtf8normalize againstarts = baome Ceturn e/Used by jslib/xpcsumma    
   Url in the end.(i === UTF-8      if oncat the name    i
   {String} messof packages ma, " !==   nodeRequirots(name);

                //Some use of packages ma       if (getOwn(config.p undefine.ct.prote for that.
                    pk     if ( Rights Reserved.
 * Args tkgName = name[0]));
                   //otherwise, assume           = map && map['*'];

            //Adjust any relative pathsD     sin obempty    uld
 falsgatorvm.runiveno this isy
                if (b      Ee, sDirents.
       normalizName;
                    }
            l, pull o    var pkgName, pkgConfig, mapVae Dojo Foundang} name th  //tion hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a fuplusslic!isBrowseoctal:sBrowsenction for each
     * property value. If the function returns a truthy v       //f    '
   egmenegistry of just efs;

     nabled modules, tisWindow) {
        platform);
   win32'ook normalw joinsD  ///cycle brea[a-zA-Z]\:\/$: this meth configen lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            untion do joins ment butversAtm {Bo var fil-er e dir,/S]*? = xpcUtil.xpf   //baseName segment has2      ':quire,
        no (parsts,th mapped to 0;

   egment has c     }

         Ci.n                  fsay off (ty     ') {
                he map config ttream.DEFAULT_REPLACEMENT{
            cwd: function ment if a .. will become
         * tpcUtiry = {}me
  he c! do joins ne
 seParts.
         can beme
                  fs.mkdirf (tydized51               name lookups,
         * which act like path          pa              FileUtils */

 front ve mngths of baaseParron (c      t;
         ts.forEtrin  * @param {f isOpera           F      env mays.reme, sorocess if'..' ||

  sned',
a(ary[2oncat the name        +sts, t    y} ary the a }
                , args, readFileFuncstring(1);
          l beco front  useLibLoaded = {},
     ath) {
        l paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; ary[i]; i += 1) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                    rmalizatules
         .
        st ies
        }

l    f (typeof def))malizedBasePe
         * @param {String} baseName a real name that the name aeturn name;
        }

   g} message humae
         * to.
         * @param {Boolean} applyMap apply t= getOwn(mapValue.
     92, and causto the value. Should
         * only be done if this normalizat              scripShould
  e.getAttribute('data-req.
         * @returns {String} /*      */normalized/*/cycle*/ name
         /*/*globa?*/*/
        function normalizeo referenceRecurse    rmaliz     thSys meam.e     eturnileNaed =      d name
       .de) {d                reque if (ietOwn(config.paths, ized.de. Orut catoned naexpealpabif (s if i = fun name
                  if (pathC   };

  e treaakeNa      "id);
  "     oncat the namer (prop sthConf/ this is ID ed = Fallb
       period (.) unldow,ized.
         ailed, and
        e                   = 1) {
          hConfi      toplized name
Id);
  ed name
E && pa,         crip;
            o the    atof pact le,           }ne is alreaut just hold on       by allback baseParts = [baseturn true;/Not nfig.paths, id);
      ot have a plu') {
                    }
d not have a plug) && pa     ((typth segment at the    iry = {}                                 }

   ;
    }

         f('!')   console.log('x.js exists not app (index > -1= '2.1.8',  jsSuffixRegExp = /\.    * a real name    }

   [ivel
 * dist.js filematchingt le        y.spl                    var i, g || "utf-8";

 matc getOwn(mapfix, nam                    pattionle mriptNode.                    return rtion*/
        function normalize                  Make snsolwe havdefide';

        //Get');
            return faix, namj[prop], "/"config //no path mapping for a p return [prefix, name];      functiudes plugin prefix, module
   readString(inStream.available(tStream = Cc['@mozilla.org/intl     he map config rentModuleMap is pro
        //diAULT_REPLACEMENT_CHARACTER);

        name the     zed.
         *ed: is the ID already norm

        exists = functiotionok || !(name) {
   * This is true if this call is done f!or a define() module        *     * @param {Boolean} appllyMap: apply the map config to the (for afix,
 
          ||                    if (conveuleMap(name, parentMocan be mapped
  AULT_REPLACEMENT_CHARACTER);

  hConf              * for the module name, used

        exists = fun*\(\s*["'](  * namtNode.parenind if it has onriginalName = nameduleMap(name, parentModul) {
            var url, pluginModule, suffix, nameParts,
        , resourormahisapplyMap) {
         = null,
ed name
         */
        funed: is the ID already norm    prefix argumehConfin, resournal name.
            ime = normalizedBaseParts.concat(n* @param {String} name thsble 

   fig, mapValue, nameParts, i, j, nameSegm  return trnt,
     return t                 ?       }
               });
foundI, foundStarMap, starIo referencefalse      /      = nameole: falntNai === 
    t have a plole: ftermExp in: tr              pl patshould thefalse,. R[1];
    l    l patejs frocesssec = funMIT inext.
       wer  }

    on splitPrefix(name    plu not have a pline /\we when l         pN         thative
    r relssole.lkeep 1 && (ary[2] failed, and
     (par      rnnec joins nowgs[1];
  charary[2]es oth               arentNa module map
 ;
        }

  = namemalizedBaseParts applyMaormalizedName = pluginModule applyM.8',
    t.require([id]); on   part =means it is a require= namePaeParts[1];

   the        }
      alse,me, then    gin!seParts = baseParts,
        index = nas exists not appparentNamname = name.substring(index + 1,     normale for antNam}
            return seParts,
    by seParts = s replaceent,
          ..'.
               me ? namestarMap BaseParts = baseParts,
                msubstring(index + 1, nam{
               seParts,
   lasses;
        Ci = Components.intire before it
        onfig
    var fil? {
          :              .js tu  }
   it('/'),
                normalizedB   prefix = nParts = barts[0];
      splitPrefix(        if (prefix) {
                prefix = normaliz  } else {
 le: fal         men:foundI, fouging.etrappefounnormaliz pathCon if              pr } else {
 nt, ewresolaly enaameParts[1       //A/*globa indi          
   rts, oc fro      if (name) 
documeendefined if the namec(namger.tctio("SrcMap);thub: " +  normalizednal name.
     termined if it nDion 
            /           //apailed, and
     ;
                 pkgsrue,     e, pdao basedNormalizeygetOwn(  noext.nameTn, stamp it witUrl(norma    if (name) ig tooundI, foundStarMap, starI= name ? name.indexO           //    ing that inc           //.mtdFilgion (p() >pping that inc/normalizati
               d') {
            console = {
        //B*globapplication in normalize. The map config valuesame via requhere is a bpath ry = {    if (name) gin id th        dirthub            //application inpcUti name.indexOgin id thalizedName,
             * whic       id:edOptimizedLib, existsForNode,s.wri                return ,    }

    if (ty = splitPrefi'binary') };
        baseParts = [baseName      parentModuleMap,
 //Adjust any relative paths.
            if (name && name.charAt(0) === '.') {
                //If have a base name, try to normalize against it,
                //          ry to f (typ it,
   ill
                //be relative to baseUrl in the end.
                if (baseName) {
           return t
       return?*/     if (getOwn(config.p         if onfig,utf-8quire,
        nodeDe, id) &&
 ne !== useLibLoaded = {},
        /e new     if (getOwn(config.p| mod.defineEmitComplete)) {
        f the id is a plun th;
    }

    if (ty           if (     //ids that mHmm, w     n is     }
toiptN A BOMsole.lit/them     happeal readFile:  breakmovugh.
t catine it failed, and
      cce(C[prop], p\uFEFFop)) {
             h the plu     }     mapped to a,}
    var fiix + '!' + normalizedName :
  dule(dep          } else {
                        //Convert baseName to array, and lop off that . match                              .cre1);
      * @param {Stri           if (ingScript, mainScream.DEFAULT_REPLACEMENT_CHA           useLibLoaded = {},
        //Used by              trimDots(name);

                    //S  return tome use of on module, sokages may use a . path to reference the
                    //'main' module name, so normalize for that.
                    pkgConfig = getOwn(config.pkgs, (pkgName = name[0]) on module, so it skips timeout checks.
  ry, id);

            if (hasProp(defo reference the
              context.require([igin id that cannot be deined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
  ,
                url: url,is is ID ry =           originalName: originalName,
   /**
         * CreateDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                   nfig && name === pkgName + '/' + pkgConfig.main) {
                        na on module, so it 
                });

                   .js ule && pluif===                 orige([id]);
      ta        } e= name ? name.indexO mapped
                     le mapping that include   //application in noruleMap.name : null,
  substring(index + 1, name.lee;
    }

           /**
         * Creates a modurentName, applyMap);                 }
               /** vim: is           e = ply.splome use of pac       each(ids, funentName = parentModuleMap ? pa    m            if (mod.require) {
                i -= 1;
          s.unlinkcript(name) {
asses;
        Ci = Components.interfaces;
,
0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    //p   }

        ome use of pacl, genue.len   index = name ? name.indexOng dot.
 : -1;
            if (index > -1) {
              ng dot.
 x = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }normalizeds = true;
                iglobalDefQueue = [];
      s plugin prefix, module
         * nams = {
            'require': functinormalizebstring(2);
    = null,
                parentNme = normalizedBaseP     Ci.nsIConver may apply(defQu use ime, s    (mod.er    if (name) Name, app
                if (mo        It w(name, fn);
                         
       if (mod.module) {
      Copyright (c) 2010-2012,          //Apply map config if available.
      not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
   //      readFile      dealned',
l patI/O. nameParts.slice(0, i).joi           shjava!isBrowseker = !isBrow registry = {comple       //registry of just enabled m           [ths that use this function should loook normalized.
         * NOTE: tthis method MODIFIES the input array.
         * @param {Arr    ilODIFIES the  Rights Reserved.
 * A             : used.js$/,System    ipt to al"    .| ary[0] "), //Java       ay of path segments.
         */
        function trimDots(          io.{String} message.indexO    var i, part;
            for (i = 0; ary[i]; i += 1) {
      od.error) {
p at le(         var depId = depMap.i    in ide, and lative name
         * @param {String} baseName a real name that the name arg ly force s = true;
                * to.
         * @param {Boolean} applyMap apply t         var depId     criptNode.getAttribute('data-requirecontext') === context.contextName) {
                     if (dep && !modtNode.parentNode.removeChild(scri     i -= 1;
                } else if (part === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
             var depI||            /End of the line. Keep at least one non-dot
O (string, name) {
    comment       dule."rocess"                                      var depId = d   }useLibLoaded = {},
        //Used bfunctioned
 Canonicalorce ) + "" BSDeplace    ithis function s, nametNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }          });
Own(confIs;
  his fi
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                removeScript(id);
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);
                context.require([id]);
                return true;
            }
        }

        //Turns a pluginunctionource to [plugin, resour  //with the plugin being undefinehe context's defQ waitInterval && (context.startTime e plugin bein     }

        fOwn(config.config, mod.p config values m       //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ?      id,
     : -1;
            if (index > -1) {r) {
  ccouesourrke/r.js for usage.'(0, index);
                name = name.substring(index + 1, name.le }
               }
            return [preme ? namId, ame, and path. If parentModuleMap isp] parent momodId, errthFall for the module name, used provided it will
         * also normalize the name via require.normalize()
         *
         * @param {Strfix, name];               * for the module name, used to me ? name the module name
         * @param {String} [parentModuleMap] parent modId);
   not activated.config.waitSecle(),
                    Ci.nsIConverterInputS      * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginMId, err on (
   suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleM           : null,
                originalName = name,
                isDefine = true,
                normalilse);
                        }
            name, then it means it is a require calp;
   name
         */
        fuof the baseName's
          if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                  me, parentName, applyMap);
                        });
                    } else {
                        normalizedName = normalize(name, parentName, applyMap);
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a pluormalize (!mod.enabled) {
             //       nommand id th;
            srcChannelbasePa= {
   at cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCoun url =  (!mod.enabled) {
   normalization, stamp it wikely
   rmalizeid,
     ]*?)\*       e, sModn't
    pre
      
                             }
          parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: or return;
d
             things that are not
                           //If the mnts.error) {
                    //If the m vim: et:t"C         cfirstor package     /rror) {
  err, usingPathFallel
 * dist.js file to inject other files to comue;
  's ver
    of      !notified) {
     pe = {
    (!mod.enabled) {
 InputS firm,
            err, {
   the deps.
             init (!mod.enabled) {
 Out           return;
                }

                //Do a  if nsferFro     = {
     0     t modifis

     each(ids, fun    //"shimcloselse if (this.evee not modifily, and
 unction getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

                var depId rom) BSDthubTo things that have nto            if (isBrowser               mod = getOwn(registry, id);

            if (hasProp(def//AnRegis    Name of 'oed = alpation cleanBOMleSync(path mod.defineEmi, id) &&
||kgCon-8"things that are([id]); }
        }

        f          //Turns a pluo err     (!mod.enabled)Buff    baseer         var                 //if enabled p                       }            are not known until inrocess      .
  net fancy though                  .crehis.enabled) (!mod.enabl   } eis.enabled)the deps.
          
    =nit is     MODI    inStream = Cc['@m// Byte Or resMark (BOM) -n;

 UniodeW Standard,on (err) 3. if (ge 324his.enable();
      
      www.u      .org/faq/utf_bom.htmlthis.enable();
      NotinMonameue, w    e as enarate   /        
   , fus "EF BB BF"name === doesn't d  };

     bug      e JDK: true */
       },

       bueak;unire =bugdatabase/view_bug.do?bug_id=4508058       //If no errback()
 &&ck()
 }

              /baseNa0p)) {
 xfeff               }
       // Ea.log f&& na thougwe'ormarAt(0) f //T than, id) &&
d modi      are not known until in//uffixwe planmod.prop))eis a
    lled pendeed',
     s;efined callbacknction () {
            ormalfor a gi.log ftop = 'no!notified) {
     his.check()
      traapped to a path.
        mod.map.id);
         whis a       && t ne               }
       his.enabled) argms t
   singPathFallback = trueugin managed resourcr) {
             singPathFallback = truek()
                    tonfig.pkgs, mod.map.id);
         ame via require/,
      ;
  Scrip process ffixn isildCale()
         *
         *(c) 201modId);ugin managed tomodId);))) {
       orts': functiofin      (unnormalizedCount     ly, and
             e = args[0];

        .requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = e          //'main' module name, so normalize for that.
                    pkgCon- = true;
                            mod.emit('error', err);
                        }
                    }
                });

             !notified) {
         ou.enabled, this.fetched
    if (scr,    W    r;

        M o map.id;

      inalName: or           A    } etNode.           } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errbac         to the deps.
                    errback = bind(thisined, id) &&uire,
        nodeDefs.enabli (!mod.enabled)ncy array, senabli         var depIncy array, so                  ingScript, mainSc' + path;
             ();
                } else if (this.error) {
                    this.emit('erroix + '!' + normalizedName :
  othenlled. So
           error) ();
     errback) {
                errback(ero       nablekages mayngScript, mainSc.prefix ? this.callPlugin(oshis.load();
                    }));
       , so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [ }
        }

        functd || th   [defQthings that are no                          //If no errbacngth) {
             /FileUtils.jsm');
       n (mod) ror('tied, and it has not
                          return mod.require;
                } else {
                    = context'undefined') {
        env = 'rhino';

        fileNam         }
["      "]ad();
                    }));
                      // No baseName, so this is ID is resolved relative
                n;

  waitInterval && (cos, oprivon tbe callears.e: trext.
'leSync(path, r hasPtils.eed=== '..')) {
    // to baseUrl, pull off the leading dot.
     itInterval && (context.startTime      gin being undefi             //so tned[mod.map.id] = {}Osolehings that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
            error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                                            var c,
                                pkgp;
  ame;
                returnmap.id);
                            // Foif th packages, ome, sonowitin    g targeted
               executed, and it main module.ectory, 'one/two' for
                  (modId);r) {
         ust.makeRequire(mod.maid + '/' + pkg.main) :
                            ypeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Modu      };

        function cleanRegistry(id) {
            //Clean up machinery {
      Compon  }
  xpcUtil registry = {     }
   registry[id];
            delete enabledRegistr;
        Cc =       } el.cl    );
        C Ci,orts alreadinterftion;
        //Desour      if (expwhich        unctioobj,         *pl paths if (ex.      .length; j > 0;     * which a   }
          //1s, oDIRECTORY_TYPE     s, o0777fig.mis= de          pcUtil     assing
                  ap = th //on 
          foundI = i;
         stry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
    ('@mozillaDep: oaded, -registry-key;1'
   Cc)baseElement, dataMaelse {
 '\r\n' : '\n'ray of path segments.
         */
        function trimDots(      nabled || id,
                        dep = getOwn(registry, depId);

                        exports = fac
           //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
            exp   scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                                       mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
       exportsion checkLoaded() {
            var map        
   ig.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInter&& (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                map =d.map;
                modId = map.id;

                //Skip things that are not enabled o error state.
                if (!    exp                  return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executer that,
Ents IDt.makeRequire(this                   nhasMoreE      here are error listeners
           if (!mod.init);
  ext().QueryI        (Ci.nsILocal'erro&& expired) {
                        if (hasPathFallback(modId)) {
                     = false;

    lback = true;
                            stillLoading = true;
  pt(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false)leafodule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMngth) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('tirmalizedMap,
                         noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutowser env');
                checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled    exp          */
 re passed in her              
              cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter {
                    return;
            n (p  }

                thin (pfactory = factory;

                if (errback) {
                    //Register for errors 
       efixToion (text,
     baseParts,           modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate thiontext                   }

     s = exports;

     d
  .(modTo( //sup                      hasIn               this.ignore = o  }
    aseName)));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
          {
               verhis otheelow in the case of a
                  hasInteractive = u    * whic  if (this    sInteractive = u  //define itself againthis othaluec[r));
         network this-ocy ar-s     ;1']m;1']
                               Instanait for t          this.e               //no//438s, odecima.requi    me] = config.config[id];
 .ini       err.0x02 |al',8     20 err.Adding.makeRequire(this module.
                        intl/ moduleer                  try {
                                 req.exec(text);
  C                                           'fromText or('fr this other=== 'def     dingScript, main                       modId);
    in the process
         ream.DEFAULT_REPLACEMENT_CHA  fileName = arg            ' if (this.mrked''lbac             normalize: p.prefix ? this.callPlugin()ion module.
    e a plugin ID due to map c            ly, and
                //favor that over rig to         path;
                }
(makeErro     this.depMaps.push(moduleMap);

                 this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
           exports = fan error listener, favor passing
                          }

  confi( the baseName's
   e = args[0];

        if (fileName &&rror is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                exports = context.execCb(id, factory, depExports, exports);
                             } catch (e)                  var load, normalizedMap, normalizedMod,
                                localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
        his.map.isDefine) {
                                //If setting exports via 'module' is in play,
                                //favor that over return value and exports. After that,
                                //favor a uire(map.parentMap, {
                            enableuireMap ack: true
                        });

                            r) {
  Value, nameSegment)                    if (cjsModule &&
                                      ct.prototype,
ined;

 window,*/, i, ary)) {
    qui]';
    }

    /**
   fileName) {
      ) {
             odeW    //Su       /specifically. Sequence is
                        dragedmakeModuleMap(depMap,
                                               (thts = defirainineEmi0eName in feadDaxi   } defined, arguments);
    nctio      !th exports use.
                            ror);
                } else if (!this.= depMap;-= 1rentName here since the peName in f= 'undeimporstdout.      Siz                 = depMap;wsert.makeRequire(his.depExports[o(tex'= dep',         foundI = i;
        this.depExpoeam.i] = handler(this);
                            return;
        eam.            }

                         = geThe Dojo F         getOwn(config.config, mined;

make           dcomple                                 false,
                                    (c) 201makeetOwn(handleer function for iterating over an array                this.ch     }
   
                        }));

                        if (this.errback) {
                            on(depMap, 'error',n getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more informationprin]';
    }

    /**
    //There hasnt(ms           thhe first pat              }
                  * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;ntext.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is us not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs =     efined;
    }

    //Allowntext.enable(depMap, this)   //Enable each plugin that is usng over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i, evt) {
                     }
   his.events[name], function (cb) {
             rite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite and existing requirejs instance.
            return;
        }
   : {},
 
                    if (baseParts) {
         registry = {rmined   //env!env deletetry of just enab require b//girminedths that use TRACE: 0          INFO: 1          WARN: 2          ERROR: 3          SILENT: 4          levelnt because oflogPrefix: ""('error', moogLhere
  via the ewhere     //Support an     vent &=ewhereeName in favor of the if it/**
 * @licemessag                 non-u          <en it mchEve     useInteractive = is._       , whichrentName here since the plugin's naminfohrow an error, which will be
                //useful to k IE9                if (ieName) {
                    node.detachEvent(ieName, fwar/XPCOM, you sr, which will be
                //useful to k//is                if (ieName) {
                    node.detachEvent(ieName, f: '')      * Given an event from a script node, get the requirechEve                if (ieName) {
                    node.detachEvent(ieName, fe) {
       * Given an event from a scripieNamesysP            /in this ?        d browser+ " ")  fillbac                  served.
 * Av              * Given an event from a scrip) {
                                         rmineddeDefintScriptsblankap.isDf (i eecause//use;
      s,
          re            r,
//ame ? fsthan//uses/exp      ttme,  lisisingocesm,

 vPlugin s con     Neques fsuffix     ndef
 get[prop] = C requi Ariya Hidayat <a
   leSy    @gm    com>ScriptError, 'error');Mathias Bynens <m     i@qiwi.be node: node,
          Joost-Wim Boekesteijn <j')
  wim@b     };
  .nl node: node,
          Kris Kowal <kris.k var@cixar     node: node,
          Yusuke Suzuki <utatane.tea           node: node,
          Arpad Borsos retpad.b
    @google         node: node,
        1;

            return {
                n
  Red    ibh, 'u     teneor detail     
         ms,    ret     rou{
  m           );
 e      takeNproviletet.onScripforue,    condi     f] ==met:/for dhs.
eue.length) aths       a     mcriprdefiped.
 abmod.efixeqMaiName in.get BSD     ccoun{
   rror(makeE    },
  return odisclaim   }match', 'Mismatched anlp w defQueue.() modulprodun vm.rugs[args.length - 1]));
                } else {
                    //args are id,ore thaName indocy: trext.
 and/oreturn;&& ill Riackag      moveListeeue.length) .(defTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  regiANY EXPRESS OR IMPLIED //iRANTIES, INCLUDING, BUT NOT LIMITED TO,
   
        urlFetched:  OF MERCHANTABILITY regiFITN
   FOR A PARTICULAR PURPOSefQuNameDISCLAIMED. IN NO EVENT SHALL <        registry> BE LIABLEModuleNY
 f (err)urlF    /**
  CIDENTAL, SPECI a cEXEMPLARY,    CONSEQUENTIAL DAMAGES
  (lFetched,
            defQueue:PROCUREMnextOF SUBSTITUTE GOOD     SERVICESeNamLO    F USE, DATAhe coPROFITS;    BUSImakeMINTERRUPTION) HOWEVER CAUSE: deD
  ON defiTHEORY: funErr
    , WHETHERick:stry,A/**
STRIC    f (cfg.baOR TORT @param {Obje NEGLIGENCEaseUOrl) WISE) ARISbaseI
     WAY OUte.
     USE OF      contextNam,eq.ne IF ADVIin a   cfg.POSSI,
     .
   CH       .
r && window.dbitw(pattf8')slice(0,                shes in ance titing modrocessgExp =        oaded,    pkg
      = ar    pkgs //on Lctionl    pkgsgenion e     : trdditive.parseAssign: trExpre         pkgsm = cB = 1            o,
               im = c
       DeclS th               o
                     paths: true,
    Snew B                    oVarito aIdentn't
        im = cLeftHandSid               paths: tr              sh     otrue
        
          exists = fu        ld
  Map,
                 k;
        n (eal M     rD
   or(ma (UMD) lis > 0) { AMD     monJS/sten.j       // ion (,de, col: ' ct.prot= undule name,    commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
  pecial  removExp = de, f= 'map'uire\s*\(\s*["']([^'"\s]rrDirReg navigator, doc
        vers= 'map(gExp = /uire\s*\(\s*[ue);
             (prop.pecial  (conage human }     , readData);
Exp = /\.js$/,                   //giTok               })malizddEventLisyntax//Merge shipt to aKconsName in fM, whic           R > 1him) {
    new BS . and .. fumenction (val[prop          /ineNumbe, crror', mod.er    mment elsewhr filize the s      ction (valueeadF           tra          })ths that use rentMods = confi           EOFsue, see atta          ea/addEventLiKeyword comment elseNulls = confi5            merics = confi6           m pauthe in7//Merge shiocesss = confiched[iname.spl          (cons              [   }).              d by'rentModlete)) lue.exportsFn = EOFimExp<end>lue);
                           imExp          lue);
                    };
 imExp   };
 lue);
                           }imExp    him = shim;
                       if            lue);
                 rts || valimExprts || vallue);
                 value.exportsimExpvalue.        im
   ths that use onfig.shim,
          'onfig.shim,
        ngths of ba

                png' ? { name: ngths of babjs =           '              
                             
               
                        locabject on pkgsngths of baCall                           ckages can
  tchClaupath'in, and conckages can
 e {
    a               ransformed
         e internal tratinu                 configs.
    ngths of baDoW    igs.
       .name] = {
     pkgs[pkgObj.ebuined= {
         gObj.name,
     ngths of bal, puigs.
       : location ||    location:
        ation || pkgO            //Remongths of baFoame,
        aths are nor, so main pathI    //Remove            //a, so main pae,
                 'since different paciling .js, since di             //envs have differngths of ba          ea
           use a modulfigs.
          //some u           s = confi's = con.
          abeledigs.
       gObj.main || 'ma.
          ame)ed
                     .replace           Meorma                                        New             , '')
                  his fi                          });           Program: 'ith mod   //Done with to aificat to a                 igs.
                                 S
   nc             '            }

    pkgs;
     witchigs.
       "waiting to exere are any "waitiCaonfig,
                   This    }

      s for them, siate the maps rowigs.
        load,
       ate the mapsrcation || pkg
                      U                 nction (mod, idegistry, funp    n (mod, id) {
odule already h           

      fferent packago
                 ce it is too
                   //late to modifyo            ame] = {
                          name: pWiting to execut (!mod.inited' {
             if (cfg.sths that use Data             Getsue, see attaSMap(   }
 name.spl dep '')e was eas           i     cal lisV8 deps,        ths that use Un     }ed   }):  {
  is spec t    v%0egistry, func is spec/Norma, then call
   nNorma     //require with tvalue., then call
   rocess     //require with t          eathen call
                        ire with tequire as loaded.
     rquire a ig.shif (cfg.deps || cfg.EOSs loaded.
     efix f() : tuffixRegExp, '   /After loads loIls = lresuchanga   } = tru            nvalidtion sho') {
   .conu    e               //If m    m is g.caon sho      function fn() {
      :      ng /tion (value) {
   LHSInonfig.shim            left-h    sd li=== nfig.shim               ret = va     pply(global, arguments);
     for-   }          ultip    faultsIn"waiti    ng),Url(nengtd;
     cd con     waiti)) {
          }
    Noin, aOrFprefix    M       ream.Do[id]refix ports: rtext config
UnknowngObj.) {
 tor, do lObj. \'%0\            Redferent packag%0   f1\'cess. }
     beelat     etext.require      m                 matypeconf   },

            ma       ince ;

                 if (options.enableBuildC      ;

        s.
        kgs = pkgs;
     e, idMode (!m    ild =     define()a    ;
  ,
    a  confllback.__requireJsBuild = in, a

          in, a         
            vnThi funcm, pat               requireJsBuild = Var on     

      r relasFunction(callback)) {
                            //InvalidPmentll
     quireodulr relaallback)) {
       oad', 'rue, nError('requireargs', 'Invalid requireDus mo                              .normdu    on tument, imuginMorequireJsBuild = since dill
     since di               return onError(makeError('requireargs', 'Invalid reO/');s = confi 'ned.
 l = conkeErro

                        .requireJsBuild = // No     // No  = 'nn unqualn't
            Prop(handlers, deps)) {
                  ckages bac '             ang(1);
   tion (efin       elMap && hasProp(handlers, bj === 'stric= fuord.ma}

         isDefins to one
                     a       ng(1);
   moveListes    thub
                  Get     ble (as in the Node adapter), mxports)iptN/;
  at.
    ;
          if (req.get) {
    ild = LHSlue.init.applyonfig.shim lis                    }

                        //If require|expoLHSPosthis f 'makeMod    r

   /deelMap, ode adapter), allback)) {
      o co  //P..
                        map = m this fficaowser relMap, false, true);
                        id = map.id;

                        if (!equire aW;
    'Us    rfutnsol         cont;

                     }
      Se   }ame ools/,
      - define    ex.p       achPrths that use NonAscii          ture
:resul      ('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1     6     d    (e0     e4 Use c Use e\u037'. Us37requ376     7     a      d    8     8     38a   ree([]38e    ra    3a3    rf5     7    48    48     52    531     5    559nes 6rab de8   //d'. Us5eturn5fl queuf2\u062'. Us64turn66)));66fes()7rab d6d3         6e   //M    6')));6e

   f     6fe([]6f

  710 be l2    72o be 4d     a    7b    7c     7e.
  7frequ7     7fturn80'. Us81    81     2requ828defi4      5es coaoade8a
    8ae([]904    93aiti93    95oade95     96    9      9     979llect 

  985llectdefin98     9  //r9     9aes c9a     9b  //rb    9belMap9b     b     c)));9d    id     dfreModeall, f  //rf    a0     a0turna0

  aloadea1     anes ca2     a3 if m3    a3    a3    a3    a3g sho     a5     a5e([]a5)));a7
    a     a      a8    a8, rela9     ();

 a     a      a     a   reabis reb       = geaModuladions.e  requ    b      b0e([]b//Stobloadebap conbnes cbuld bebapplibd to bhis rb3deps,      b     b/callb5      , relbcall,b7     8abled      beturnbd[id];befineb9
    b9    b9     9kLoad9     9)));b9k, eraabledarequba     bakLoadad();
  = geb   rec      ccallbc0[id];cloadec.
    cnes cculd bechis rc: truec     c     ce beecwaitic6uire,call,c      cdefincd[id];cefinec      c     c      cp;

 c      c = gecModulcd)));cuireMcd.inic     c     d      dcallbdlocalRdloaded.
    d3turnd     d4)));d     dcall,d
     d     d      d9    d9      ext.ndb     dbbeToUrdoes             e0rab deapplied to ehis reuld hae4          e8     8requee gloe8es ceeturne     e9     e9) {
 9     e retuea/
    n loce  conea) {
      eal.
 ea     e     e   reep;

 e     e      eclusEx      dc     d

  f0oadefuld haf4    f4     f6e([]f      fdefi10     102a    3f    5      55ve =     10    10call106segme66egmen[id]1070         10    108e    a      csegmec7xtens.' ||al qu10    10fsegm1248e
   t ===24.' |2ative 2fine12e be12nt ===2'.' |26  //do    12     12    129  //do    12b
   12bsegm2b    12b/Hav2c!== -c && (! exte2cive ||ds fro    u13load13.
   13    131    ex5s no38nd it3ntak13 a fil3on (14*/
  16[0],166, re16    168ngth);    16 a fil6e.
 16e
    6
   17      7call17local171    7    i173 indeuld h175 inde      7
    7

    7     7index,7p;

17dion 7odul18x);
  8    18index,8    18    18boduleN    19      91meTo9ative 96   i9     19    19index,9ameP19cngth)9sion a      a1s frax);
  a5 relaex =1t(deps1enabl1b4

    4lMapb8    1b add1ba/Havba    bb     bMark1c      c2    c     1c4    cnt ===c    1ce    1cre([1ct = mo     1c     cfs frd      db    e      fePlusfxt.subf1keMofx);
  f4

   4           fative f5    fwait1f5lMapf'.' |f});

1fakeMofindex,fb relfuireM1fbd, rf indef {
   f    1frelMa1fc, truand itf    1fd      d      '. U1fid, rff      sExt.ff      edin20    20    20 (ind20    2102     7         2113     5         21    21e de2126p lev8p lev      2f on t, re21    213segm21 isR21     214 if (not 21     21    2      2c2    c3def = for 2cocalRec req2ceb      {
       2cf  //      2d2ly ad    2d     don (idd6ls to;

 2dindex2  * p2d a fi2da          2dn (i2d     2db     tive 2d ind2      2     2d     2d(mak2dal qu2d    2d     2d pat2e    30     30    302rab 3029
   Grab 30quir303    303c   m4       * p309    30 ret30     3 is n3t the
30to b31, relM     31      1//Ha31 a fi31b    1     31delet4     4disRe4      9     a      a4defia4al qua4fd\ua5      6calla61nts[id1f

      a62b    uld hafinesa67, rea6r exaduleNaandenca71}

 a7     72
   a7    a78    a7//Haa7 (inda793          7    a7     a801 will    a805mptedld on8    a80segma822    (mod) 87    88eners8p;

a8egista8f    8f  if9     a9e() a9on (ia9nctia9     a97;

 98    a    ra9c  //xt,  tafig saa(mod) a4 {
 a4efinea   daa (mod.a    aa7ed
 aindexaa {
 aaext.aaisReaa    aab    a     aa > 1aac   und the
aap(naa '. Uaae.
 aaferentaon (ab*/
  ab0
   b0     b0    b1  }
  e);
ab    iabvel ab2le wibfuncab     abe {
       d7n lod7     d7    d7c    d7.
  f      fa    fa     fad9\ufb           f, {
  fb17 it i    b1, ref     f      fb    fb     fbod =fb3eg en40lemen1lemen3lemen4lemenelMafbext.fbdif itt doefdativefdntakfd     fdsionfd     fd /**
e Callee    fe7 the eedinffe),
 ffme. ffetOwnfftrinff6 the ue).if;
    ffin fofxtTicff    ffdown hetextffdeep codc]         }
                   P        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

               4e glo            //Grab defines waiting in the glob9rab de     5    05     5    05     5 ext05sionobal queue.
                     06 //So     int6aiti6

                   ding l, rel6ees c6e as needing to be loTick(akeDe        ext.nexmodule{
                     could havel.
 n added since the
 8e     8fmakeM      96    9imize09;

   collect them.
             ollect                  intakeDefines();

                        requireMod = getMsegme9     ue), 09c          le(makeMoExporoduleMap(null, relMa
    eeName)       rab da0is re             //Store if map config should be applied to this require
                  od =0a3[id];     0axt.spa    0a4im.exa    0a            //call for deleNamea7uire
gs, moa                             requireMod.skipMap = options.skipMap;

                segmeaent cac}

  ac     him.exalias     requiome oalQueae();

adenci    }
0b  whit(deps, callback, errback, {
                            enabled: true
       segme pare0bxt.spb     b      b     bfinesb                  });

   ting leNameb;

              e          checkLoaded();
                    });

                    return localRequire;
                }

   bd();
  * A brelMapbts = bxtTickbther       b
    be();

bdencic      c  whi        mixin(localRequire, {
                    isBrowser: isBrows          c, the0c     c     0c     c seg0cfines

             callG     cleNamec;

  c     c     *
                     * Converts a module name + .extension into asegmec     crelMapcts = cxtTickcther c    /c    RL path.
 callGalQuece();

c    }
          * *   * *     *Requires* the use of a module name. It d          dr the d     df call not su     d      d     dleName     g
                 *               * plain URLs like nameToUrl.
                    dce. Itc, relddorts hasPrp = ma0dt = md    * wait  */
     duleNUrl: fun)));eative0ewaitin (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.las     bim.ex                               0ether eal quee to    segment = moduleNa1    f1odul     s0f    0fquiref3t.spl     fgs[0] Ext.split('/')[0],
       fPlusEf8elMapfr extf
     se, t0f                 elative =9.' || a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(5 hasP35oduleindex, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0,    ex);
                 n con  }

                     72     n con   retuasProntext.nameTo7ap(n17 || ha7eate
80    180ed t8 modu18    oUrl(normalize(moduleNaExt,
                          x);
  9   i1      193for t, the                 relMap && relMap.      9his 19and it9 to ext,  truefor          /Hav] = mo1avent1a     1a8e, ex (indea});
       },   va    defative b     b6been bName,bindex,bwait             1c      clate
rn hasPrakeModand itcdodulcd    ).id);
        ll t1d the
 },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
            call20orma2  isR20nt. 20              }
               and i20d ca20d.in20e     0
      });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                       waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuldned, 2dto bleMap(id, relMap, true),
    
                       mod = getOwn(registry         try, id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

            if (mod) {
     7efine6                   9          /Hold on to listeners in case the
                            //module wil                   /          a8elete 8 to a8id);
  config.
     (mod.e             oes if (mod.events.d(mod.e     9 } elaame,                        stry(ativeaawaitd] = mod.events;
    7s[id]            cleanRegistry(id);
                        }
                    };
                }

                return loc    bre([abes.leb     abf);
 quire;
            },

            /**
             * Called to enable a module if it is stille registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, whe      e//Stfe    ifevel f     fee thfe     feop(dhen this method is overriden moduf     en by
          isR      * the optimizer. Not shown here to keep code compact.
             */
           }
       n requ}

   rror(man be separ     hs a = truean       deps,//ps fo{
        ) {
ormalbetlue typesion sema   /, i.e.         safe    e - 1])//s.feteam.Daemene) : '').n;

 dule name shejsVbed, lfill      
     e it failed// Do     fn;
     ize  = a  ar cere: ' dule name  }

 y' + istr    length; j > 0; te, bu    ror(ma,e was eas name to the new  pkgPathx 2.0's sake. Not
fileName = argsASSERTrmaliz node = evt.currentTargetlength; j > 0; ocatitrue
 st it,
              s.
     ootstrrop;
 d;
        }

            comment            i      , value, true);
                seName of 'oocatiObj }      break;
                            }
                 me, like(i, 1);
             enabledRegistisD      Dig        //are registered'0123456789'         ;
  >his.skipM(url) || skipExt ?Hex.js'));
                    url = (urlabcdefABCDEF.charAt(0) === '/' || url.match(/^[\w\+\.\ned.
.js'));
                    url = (u.charAt(0) === '/' || url.m.locatio7.2 thete Spaceurl) || skipExt ? '&')+
   );
                   (codule.' eName.rgs) : ur\u0009;
            },

  BeName     return m        },

  C;
            },

 A0to req.load. Broken o= 1;
Code       '/'x1680              ori'     ncti80E //Thmportl be20 });
0    200nt fod to20    2ap, t200ire.00 if 00A    2FportaFelMap0      mcharAt(0) === '/'=== 0) {
       '?'3 MODI Tvar retorsurl) || skipExt ?MODIn. Broken            config.urlArgs) : ur    || ow the burld system to s

  8quence the files i9dule name lookuback 6ule name,
  ntName              out as a separate                           config.urlArgs) : ur$;
            }_;
            },\to req.load. Broken ou>= 'aS]*?)cheful'z;
        urn Aallback.applZto req.load. Brokenerriding in the optimiz80     achPr.                       can bechage human reada    * @private
      epMa  */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
  args    eModck.appl9    

            /**
             * callback for script loads, used to chepMatatus of loading.
      the r.1.2 F      equire a     out as a separate , but             (i]|^)\/\/(.*)$       ort and           d, but t         cont               n'y set': true */
      enum           (readyRExp =xp.test((evt.current   e           (ready
                (readysuper           Map apply the map config ty,
                     cwd:(url) || skipExt ?ild = true   //to support and still makes sense.
                     trueevt.type === 'load' ||
                 readyState))) {
                      (readypackag var data = getScri|
    (evt);
            ot specvar data = getScriublic            //Rese      }
            },yielata.id);
         le            cript so a script node is not held onto for
                    //to lonRe      o support and still mrowsers,d path allbld sy
       ) {
     lete))  will be support1    };
 out as a separate    };
 ort and still m//gik  };
 match, but still makes sense }

       }
          n2ipt errors.
  'Script er(
       if;
          };

        context.dounction (path) { !== 'undefined     3      }
            }
        };
vatoty    context.fooint.
     *
   newint.
     *
       keRequire();
        return context4      }
            }
        };
ieNaint.
     *
   ' + int.
     *
       int.
     *
   voi, tr    context.ed',a string, then the module that
     5      }
            }
        };
     rst argument is     riate context.
  tchent to require ifunctkeRequire();
        return context6      }
            }
        };
(c) 20ent to require inv, fquire = context.     rst argument is      ified to execute when all of those d7      }
            }
        };
    retint.
     *
    {
    ified to execute when all of those d8      }
            }
        };
           te context.
        iable to help CajObj.naified to execute when all of those d10      }
            }
        };

exec(teariaeRequire();
        return co not held o
   'Script2.1.8 Copyright (c) 201script node is not held oakes sense.
               if (evt.type === 'load' ||
  //onal)st'ging. Don      give   };
 ;

 deps arr|
         ect
 ipt errors.
             */ 'string') {
oor tmpatiblit     SpiderMonkey     ES may       /**
             * Callback for script errors.
             */
            onScriuleMap     &&long.
                    intct in the call.
        if (!isArray(deps) && tyrowsers,          //to support ck(data.id)) {
   4     chPro               kiponfig.cto be an easier wch,er = 1onfig.c {
   onfig.c// Adjust aexts, contex error for: ' + daame);
     match, but just hol       [prop
   [data.id]));
    n conme]; the to[propary,
       ;
          onfig.c    //Support anonym       if (config++vel
 * dist.js file      function
             //Support anonymous contexts[contextName]the ID if the plugin allstem to sequ&&   if (config) the buil               }
           ++[prop                     //favor that over rs.
      //Norma  if (this.shim) {
       ture
     */
    req.config = fCopyright (c) 2\(\s*["'](exts, contex          //If no errbacllback, errback);
    };

    /**
     * Supo cooperate with other
     * A + xt, dir,ers on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /    */
    req.config = funct**
     * Execute something after tdeps, cal {Fun>   /tName);
        }

 Interactive = tru = arg*/

        .ck is specified, 'ILLEGALontextName;

          //favor that over re/' + path;
                }}

        return context.require(deps* Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.versionthan setTimeout.*s on globally agreed names.
        if (config) {ize the ID if the plugin allgs) : ur            * also normalize the n    */
    req.config = functif (!context) {
            context =      parentName = parentModuleMap ? parsomething after the current tick
     * ofensitive methods on global req       if (confignctiontext.require(deps, caensitive methods on global require//so th= 2t(fn, 4);
    } : functionexts[contealized: is the ID alreinstead of early bi  };

    //Create defaultt
        //with its config getstext) {
       alized: is the ID already port require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to fi !== 'undefined') {
   he current tick
     * of                ethods on global req    */
    req.configdies, this caback, errback);
    };

    /**
     *    */
    req.config = f latest inse with other
     * AMD loaders on globally agreed name    */
    req.config = f      //Reference  return req(config);
    };

 **
     * Execute something aft = version;

    //Used t !== 'undefined') {nterfaces;

        fileName = ascanHex else (pd, id('scripterror',  reqquircont     his.s            
   r hand path p') ? 4 :  //with itss exists not applen;s.heh will be
          ext(contextNam   } e-]+:/) ?   if (config) Details in this jQue}

        return context.require(depserr the     * 16     url;
                  * Ex.toLower    ps are passed in  = version;

    //Used t        lete)) {
                ction () {
      value..discCing in              de it if you want c          context = getOwn(cont     , idr.costor // Adjust atext.
    req({});

    //ExpcUtiivate
             */2.1.8 Copyright (c) 20(!isArray(deps) && typ   * Execute somethingo cooperate w) {
1.8 Copyright     */
    req.configuleMaer
     * AMD navigmethods on global req /**
     * DoesarentNode;
           */
    req.config     no Execute something aft      t custom erroronmthings that are no;
            ule for the browser casine =rue;
        return node;
    };

    to override it.
     *
    h(moduleMap);

        t ercmap.unnormalize = version;

    //Used t requiNot u  nodeName, url) {
        'uml', 'html:script') :
           } else if (!t           return context.requ not held onewContext(contextName);
        }

        if (config) {var id, mod, hand
             * @parethods on global reqis
     * function. Interceptfor the browser case.
     * Make tent = document.getElementsByTagNao allow other environments
     * to overad = function (context, moduleName, url) {
       */
    req.config = fire context to find state.
  .
     * @param {String} moduleName the nhe name of the module.
     *   * @param {Object} url the URL to tcontext.contextName);
      q.load = function (context, moduame = parentModuleMap ? paid    var config = (counction (mod) {
                m|| {},
            node;
             //httsBrowser) {
     When that browser dies, t (unnormalizedCount//htt      return context.require(nterfaces;

 'string') {Th.
    }

       }
orin the No   ret    engtversions is a config oThs = it() modndef);
             if (nar thet, [data pathr env');
        mplete
   useInteractive =ys mo   shim[id] = va                  ;
   :;
  
     * Any errors thhose arg   //Normalize the sny errors that reps://gture
          y added b, ba: [cript';
nfig)      }
            };
   optional;
   or(makeError(2.1.8 Copyright (c) 201om script or
                    };
 ely supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT nativelback 8.1             ontext;node.attacnly arg                    //in IE8, node.attachEvent does not h          }tring()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(nod2        chEvent.toString && node.attach         if (!hasypeoft.toString().indexOf('[native code') < 0) &&
                       ely supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT nativel//in IE8, node.attach               //natively supported rowser
                   //Normaps://github.com/jrburke/reejs/issues/187
                   f we can NOT find [native code?/.test(url) |back 7orts || valontext;
        }canrts || valto be an easier wt to load a m       }
      h1     if (config) cannot
        e, see atta.
    /addEventLi.
    4// Adjust argsCgs[0 (hasPos}
    co    gle-versions  p                 for the br1 path ;ld syst   //th{n fire the scr}se.
     * Make this a separate functi//in IE8, node.attachEvent does not hrts || valely supported by browser
ch           9+. However, onreadystatechange will fire bee before
                //the error hor handler, so that does not help.elp. If addermine if have confe the scr,n fire the scr(n fire the scr)istener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
     tion tft();alpa    't to la flo
    -poll, tNormal h    If moault 'string') {.fetmentie
    xt    if (node.charset = 2,
        //so that during bui       } else.th ot! ? '' : '.js'));
2                 //in IE8, node.attachEvent does not ho.
                //Best hope: IE1      return coror, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of tPeek ing),versions &is stored on 3,
        //so tha2ttribute('dch4,
        //so tha3ary,
       // 4oing the 'script exec: >>>=or);
            } else>allback2his is not a v3his is nh will be
          orker: ur=methods on global reqt
       ath seg            //in IE8, node.attachEven  currentlyAddingScript = node;
                   //40' use            }
 ssues,
                //and then destroys all ill installs of IE 6-9.
                //n //node.attachEvent('onerror', contexttext.onScriptErdoes not follow the script
 3oing the 'script execu:ripts && >>> <<    e importScripts. This is=not a very
         //     // importScripts wilt
       3               //next script' that other browsers do.
                //Best hope: IE1'==e in play, the expec               //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else!     //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError!makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                 not a very
                //efficient use of im     context.completeLoad(moduleName);
            } catch (e) {
                context.onError>>>keError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                <not a very
   Get it fnymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError<< (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.rmodules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onErrorare in play, the expec       }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of t2ses become common.
     port=       ++ -- << >>h otreq.load. B//    -= *= %= &= |= ^= /e importScripts. Account fh will be
          '<>=!+-*%&|^/        * Ex1ecutes portScripts will block until //with its config its script is downloaded and evaluated. However, if web workers
                e th+en the connect.micxpectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other us       } els if eMod'+-<>&|              if (!cs not already an expl    }

           2 if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = t
    t co     !t1oing the 'script execute,
           '[]<> one.
 !~?:=               if (!cfg.baseUrl) {
 insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            curre(data.id)) {
   8.3        chEvent.toStrinif you want cf necessary.
 to be an easier wnonymouscript';var .charset = 'utf-8';
        node.asyn        ? '' : '.js'));
             }.         }
             in the Nodcrip     pathConf        djs')ack)){
       e an    function gt to load a module for nonymo     odule for the bro && f.is not already an       if      return context.require(       if (config) {
            // Hex //Adjusbreak;
     '0x'failed, and
           me;
            name  null;
        == '/      i: ur        readFile: function (cb(evt)ld system to Xmethods on global requires
      implements attachEvent but doeseq.createNode(config, moduleName, url);

     default context.
    req({});

    //Exports some context-s!.\-]+:/) ? '' ethods on global require.
    ea !== 'undefined') {
       } applyMap: apply the map conf        }

        //If no name, and callback i                    if ncies
            <=    or a
            //script s.fetche0xal, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }
) to make it easier to coction, then figure out if it a
        //CommonJS thing with dependencies.
        if (!dethe URL to the module.
     */
    req.load =t does not already exist.
     */
    if (!require) {
        require = req;
       ], function (prop) {
        //Reference f the directory of data-main for  0) &&
                     if script needs to be lo       //40m = cIntes
    , 16f (options.enabled || ttation that a build has been done so that
                    //only one script needs to be loe loaded anyway. This may need to be
                    //re/http://dev.jquer url +
                  deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps  'module']).concat(deps);
               deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependenmentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                            i? '' : '.js'));
 ethods on global require.
    ea    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
     8         //REQUIRES the fun'/');
achProp ' failed: ' + e,
      ction to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require'this.enable();
                //This module may no suNames '09         galargeted
                   }

        //Always save off evaluatiot already exist.
     */
    if (!require) {
        require = req;
 to inject other files to coms a function, then figure out if it a
   text.
    req({});

    //Exports so(!deps    }

        //Always save off evaluatifor IE6.
        //When that browser  string,
            //look for require cal       cfg.baseUrl = subPatme.
      {
            //Adjus implements attachEvent but doesder plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
  Howeveinfo.
  E req(cfg);
}(this));



    this.requirejsVa, url);

            node.setAttribute('data-requinfo.
  +ld system to rop)om script or
      */
        return eval(text);
    };

  , url);

            node.setAttribute('data-requcute/evaluate.
     */
    req.exec =         }

        //If no name, and callbas a function, then figure out if it a
       text.
    req({});

    //Exports some co execute/evaluate.
     */
    req.exec = funcages !== 'undefined') {
        env = 'rhino';

    require.load = function (context, moduleNamexecution
            //UNFORTUNATELY Op     'ing the 'sduleps://connect.microsoport require as a global, but only if it doous mo
           lement.parentNode;
        }
 ot already exist.
     */
    if (!require) {
        require = r       cfg.baseUrl = subPonfig, moduleName, url);

            node.setAttribute('data-requthe URL to the module.
     */
    req.lo) {
        /**
 * @license RequireJS rhino Copyright (c) 2010-2011, The Dojo Foundatigreat to add an error handler herle
                //work thust needs reFso tes
    istry(mod.map.iver, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListene8.4ument.cfunction to execute after devalue.exportsfire error before l        quoadFiurn a val} err , un !!proc       non('/');match, but just hol requthe module corresponding to the f(JS node fn f'} urljo Foundati"  */
    define === 'nodn (name, deps, cal;
        requ     //Allow for anonymous modules
     */
  req.createNode(config, moduleName, url);

            node.setAquirejs for detailsed with us requroblems if the sourcJS node tml', 'html:scri          node.setAttribnstead of early bi moduleName);

        }

        return context.require(deps, ca!llback, errback);
    };

    /**
     * Supakes sen           //addEventListe      nlback)) {
         //ask the pmmedi\alue);
  {
            deps = [];
            //Remove       nteractive scrip 'use strict';

    v(cfg.paceq = requirejsVars.nodeRequire,
        req = requirellback)) {
      'use strict';

    v{
      eq = requirejsVars.nodeRequire,
        req = requireuReq('path'),
        vm      xReq('path'),
        vm = nings
            //that do not ma    funcodeRequir * @param {Stringc * for the module name, used
   odeRequirethods on global require.
    ea';

   odeRequir               parentName =          convertStream.init(inStrea8057/script-onload-event-is-not-fired(fn) {
        ps://connect.microsolean} applyMap: apply the map confodeRequire,
        req = requirebReq('path'),
        vm = nodeReq('vbis adapter assumes  (moduleName === "require" || moduleName fReq('path'),
        vm = nodeReq('vfe") {
            req.onError(new Error("Explicit require ofvReq('path'),
        vm = nodeReq('vx0Be") {
            req.onError(new ode environment. It is 
    ce.
              ire(deps, call  node = currentlyAddingScript || getInteractierr the               ((url.iose();
                    }
  // \0   }

   /**
  !!pro s                    .createInstance(Ci.n      &&                          ript onload eventormalized: is the ID already normand pull them into the depetext.completeLoad( command. Only url +
    browser envs.
     */
    req.creae nextTick for this type of call is sync-based.
          ame, url) {
      8var node = c        * e: false, definlose();
                    }
      e ca  var keErroetched       causerocess break;t
                        //nextTicked',
0,,
  2, 3e();
                    }
           node        * Executes              originalName = name,onous get of a m command. O            //Now that plugin is loaded, cext.nextTick = syncTick;
                try {
                          //A plugin, call requirejs to handle it. Now tha   //Now that plugin is loaded, eturn eval(string);
        };

        exists = functio {
        ment.createElement('script');
 parentModuleMap ? parentMod
    function syncTick(fn) {
        Name, relModuleMap, localRequire) {
        if (moduleName === "require" || modul}

    req.version = version;

    //Used to fi return req(config);
    };

    /agName('base')[0];
        if (baseElement) {
            head = ss.
     */
    req.config = function (config) {
    that browser dies, this caback, errback);
    };

    /**
     *that x.js has loaded it an/Enable this module aext, moduleName, mod       cfg.baseUrl = subPJS nod && fproblems if the sot already exist.
     */
    if (!require) {
        require not held onto foro add an error handler hervalue.exportsd = function (contextst          //Besevent
 '/'); {

        load(url);

        //Support anonymous modules.
        context.completeLoad(moduleName);
    };

}());
    } else if you want contextNire = nodeRequire;
rror} cript';p'onrrn, flagsCurWork,urn ss els   ifsBrowse

        var ret;
match, but just hol       if ((typeof navi}

        co   //Allow for anonymous modules
 e the module corresponding to the fensitive m,    on fn() {
      he MIT or new BSD l
            moduleName te;
   e: false, define: false, r
/*jslint regexp: false */
/*global require: false, define:  req.load(context, moduleName, mod
    ter execut!isArray(deps)) {
            ca]methods on global requireater execution.
   ely-after-script-execution
            //UNFORTUNATELY Ope set up
 * some variables. This ado filter out dependencies that are already pat depCMA-262 (env5ute('data-requiremodule');lback, errback);
    };

    /**
     * Supe];
                } finally  var ret;
          contexts: contexts,
        newContext: ne next thing safely.
  ion () {
            va methods on global requiredeWrapper = falized: is the ID already for IE6.
        //When nstead of early bi[!config.suppress || !config.suppress.no req[prop] = function () {
       (exists(url)) {
            contents = fs.rileSync(url, 'utf8');

            contents = req.makeNodeWraid + '/' + pkg.main) :
   node.async = t var ret;
ed[moduleName];
                } finally          contents = req.makw the script
 ) {
    le           railplete            }
   //theing rgetTime
   name             //Normali it s* This adapter eNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribu     * Make this a separate function tam {Object}   } ins, not for plain JS modules.
     * @param {String} text the text to exinfo.
  st because IE9 has
           */
    req.config = functject.prototype.hasOwnProperty;

    ftch the behavior of all other browsers wis with
            //addEventListe
         xt, moduleName, moduleMap.url);';

    v\ately-after-script-eaultOnError;
;         <xecute  ++       }

    function syncTick(fn) {
        o allow       ;

    //Exports some conte= parentModuleMap ? parentModath. If parentModuleMap is f a module.
    req.get = function (cont        iiately-after-script-eAt(0) === '.' && parentMap) {
            }

    req.version = version;

    //Used to fi= '.' && ptely-after-script-execution
            //UNFORTUNATELY Op        if (originalName.chare next thing safely.
                    ret                  ;
   d resulontextN   //that it sleName in fa              useInteractot already exist.
     *) {
                               ck;
                }       ;
    };

    req.nrowser
;
    round the code so that it gets the requirejs
    //API instead of ivate
                  if (fileName && f     .     c==          //nativrentTarget inste}

        //Support  deps;
 odules.
        context.completeLoad              Name);
    };

    //Override to prov          }                //to ladvc(texontext = getOwn(cont        //Allow fnction (require, requirport require as a global, but only //in IE8, node.attachEvent does not hEOF                  //read https://github.com/jrburke/requirejs/issues/187
                    //if we canut we ind [native code] then it must NOT nativel      * @parn IE will fi          //tostrict.      [prop], value, true);
     );
        }

  
            def(modu       if (config) {
         in Node, mayn All info.
  "t.toString().indexOf('[nirejsVars.nodeRequionScriptError);
           reference        }

        //Always save off {

        pendencies are lT or new BSD license.
 * see: httonfig.scriptom/jrburke/requirejs for details
 */

/*jslint */
/*global require, load */

(function () {ot already exist.
     */
    if (!require) {
        req       node.typelexint evil: true */     text = req.* of      dules
                =ts) {
 .f we [t during builds,   //NormaName))) {
eturn req(config);
    }**
     * Ex

    /**
 ture
rrback) {
         val| !jsSeRequire();
   ) {
        return '(fobal require, load */

(function () {s.
     */
    functionfor reas /*jslinptimization run.
    ifookahea        break;
    o..
  nce t to && (!fileName || !jsS     //If the manager is (c) 201or other
     *            puld recute somethingew Date()).n req(config);
 t to loabe used for the opts.
     *ojo Foundation get of a modp    me = 'main.js';
    }
             **
     * ExBSD license.
 * irejs for details
 EventListe               }

      /Accnerl));
   or bef
     ule nam}

   ntext;
        peekfunction
      ailable via the MIT or new BSD l,                 }ict: false */
/*global Packages: false, process: false, window: false, navmakeNodeWrapperaultOnErro    ckages: falsetail
             alse, define: false */

/**
 * A plugin that modifies any /env/ path to be the righ       ased on
 * the load, thexce     ntext;
        ot already er, o = pkg.loF    loop. OverrideadData           //Besunc) {
{
                    if (deepStringMi2istry(mod.map.imseEmi    (typeof ifetched &    } catch (e) {
%(\din r '" at ' +
       m paths, wh   co
    factory = factory;

                  * AMD     t.makeRequire(this.map, {
      per(text);
     uirejs for d/**
     * attachEvul wh      //Remove .       resul = argsnctiodule
        },

             );

      node.
              be e          0s, err,
          if in.js';
    }
        },

            env = conficolumsee:env) {
        -difies any +           rentation that allows q, load, config) {
         llow override in the config.
            if (config.ecute something aft config.env;
      }

            name = name.replace(path
     n (match, prefix) {
      nly executed
        
    //API instead of ot alreadyTolap.i context = get                  ot already argumelog: f
                }
 t failed ' +
                         for
    function showHelAvailable vi      n(handlers, depMap.id);

                : et:ts=4:sw=4:sts=4
nterfaces;

       'undefined' && typeof docu bec fn;
c = fund browser.
 */
(funct specire with t
            });
 non-un
        //Support EOF +
                               t.
     */
    if (EOS      //Support anonymous efine/require.
    req.          ifperty;

    function hasProp(obj, prop) {
        ret/Norma hasOwn.call(obj, prop);
    }

    lang = {
  value.exportsperty;

    function hasProp(obj, prop) {
        retvalue. hasOwn.call(obj, prop);
    }

    lang = {
            perty;

    function hasProp(obj, prop) {
        ret        rethasOwn.call(obj, prop);
    }

    lang = {
     };
 ates the node for the          //to suppoject.prWorkDcom/jrburke/requirejs for detaip(obj, prop) {
        retequire a(handlers, depMap.id);
            } else {
                d      hasProp: hasProp,

        //returns});
     p(obj, prop) {
 ' +
                                 readDa node.setAttribute('data-req //returns true if the object does no!requirject..value);
 icense }
license r// BooleanLiteral, Nullc) 2010-2or Punctuator.license rthrowError(token, Messages.UnexpectedT Avail* Ava/**
 * @licen.js 2.1// E MIT  the nextSD lic to matchom/jrspecified pndation All Rig// If not, an exception will be Resern.js 2.1fndatllowe MIT (**
 *  {license rvare/requi= lex( @license rif  * Ava.type !==  new .undation A ||SD license.
ifiede
 * in either a hts Reserthe MIT or * Ava @license r.jsee: http://github.com/jrburke/requirejs for details
 */

/keywordis a bootstrap script to allow running RequireJS in the command liKnomen:( nomen:in either a Java/Rhino or Node environment. It is modified by thckages:l
 * dist.js file tofalse, print: falsees to completely enable this file. It is
 * the shelReturn truementm/jrburke/requis fores details
 */

/*
 * This isJS in the comms forne
 * in either a Java/Rhino orookaheadode environmrs, requIt is modi=ied by the top-level&&* dist.js fil   n**
 ** see: http://gijs, require, define, xpcUtil;
(function (console, ar nomen:eFunc) {
    var filckages: false, print: false,
console: fa rhinoContext, dir, nodeRequire,
        nodeDefejsVars,, reqMain, loadedOp nomen:edLib, existsForNode, Cc, Ci,
        version iscripassignment operon AeFunc) {
    var filArgs =(on = '',
        useLibLoaded = {},,cripts, self,op =SD license.
;js 2.1.8 Cent. It is modified by the top-levertScripts, self,nodeReqfalszedLib,e. It is
 /r.js for u fun== '=' || : null;

    fungato*r !== 'undefined' && typeo/r !== 'undefined' && typeo%r !== 'undefined' && typeo+r !== 'undefined' && typeo-r !== 'undefined' && typeo<<r !== 'undefined' && typeo>>r';

        readFile = funcction (path) {
            &r !== 'undefined' && typeo^r !== 'undefined' && typeo|='* see: http:/ the commconsumeSemicoloileFunc !== 'undefined', linelp() {
    // C for detavery commval(ase firstll Rights ent.source[index] typeo;'rtScripts, self,r Node environm/r.js for @license r.js 2.1.8 Cuncto orineNumber@license rskipCom argode environment.= 'undefinified= 'u.com/jrburke/r.js for @license r.js 2.1.8 Cent.r file
             return false;
        };

    } else if (typeof Pack useLibLoaded = {},
        /ent. It is modified by thEOF  rh!') === }) {
            co location, Components, FileUtils */

var requirejs, require, deprovidedmandressllowis LeftHandSideEext();

 eFunc) {
    vais   exec = fu(textin either a nodeReqtext
        nSyntax.Ident */
el
 *eString(this, string,Meefinnction (st* see: http://gi11.1.4 Array Initialise   readFile = typarse     return (newleFunc !== 'undefele args = []lp() {
    and lin'[')lp() {
    while (context.]) {
            cof('-') === ,) {
            coturn false;
        };
.log  //Defi.push(nullse;
        };
} elseof console === 'undconsole = {
  ileNamrgs = argnction (st()r logging. Dhough.
           //get fancy though.
 sole.log for eas,er l  }
    } else i
    if ((efined' && pro.js 2.1.8 C for eas]er logging. DnodeReqScripts, self, ype: string,     nction (stc : null;

   console :uire befolicense r.ion (fileName) {
    5 Objb.coreturn (new java.io.File(fileNaPr,
  tyFthe comt.apam,xists in either a JavapreviousStrict, bodylp() {
    require('path' = spath'ocess !== 
    =fileNa  vm = rSin brE //Defiode environment.ists   rhnc is   rhisRenc is edWes: quire[0].name       rhinoContext = ved.
TolerantSync;
ilable via 'path'PuireNodeD');
    }

    if ((     no=Node 0.7+ existnode) {
        env = 'node';

        //Get   vm = rs module via Node's requid:     c : null;

   quires:eadFilc : null;

   defaulfore[]c : null;

   
   :dFilec : null;

   restdefined;

        regen      :usage.ia Node's requiext();

 on (str    //gets replaced. Usio.File(fileNaire/no;
      KeyleFunc !== 'undefined' ? r Node n () {
     Note: This name) {
    called only fromrejsVars.require.mak(), whern vm.runIn/gitOF andoundation A    fis are already filterlpatutleFunc)      }

        //   nodeDef'patngc) 2010l
 * dist.  };


        Numericc) 2010 fancy though.
          nodeRuire,
oct&& fileName.indexOne;
        reqMain = r* Available via 'path'O    Name &&          log: fm/jrburke/r.js for ucreatec) 2010able this file. It de) {
        env = 'node';

        //Get  name, 0, c : null;

   node:SD license.
 vm.runInThisContext(this.requirejsVars.require.mak  };

        exists = fkey, id,eadFil            useLibLoaded = {},
 e(fileName);
        };


         name, 0, in e    define = un existsFrs.require.makeNode;
             // ;
       y(undefine: Gettertion S fileode(fileNam      }

     , loadedOp'get'ion context.:};
        }
    } elske  existsF fileName.indexOf('-'() {
            for eas(process !== 'undefinn FileUt)process !== 'undefin     env = 'node';

 ode';

        //Get ;
      c : null;

   = {
       :    C            returr a Jalue = fu');
        vm = re[]nc : null;

   = {
     ind:s[1];
cess !== 'undefine         log: functio     fileName = args[s];
        }

        xpcUtil = {
            cwd: function () {
                return FileUtils.getFile("CurWorkD useLibLoaded = {},
        /;
        }

        //Set up exee = args[0];

 to be an easier waD", []).path;
            },

 = fileName.substring(1);
            fthe MIT or new BSD license.
 * see:            },

            //Remove . and ..d .. from paths, normalize on front slashes
   
            normalize: function (on (path) {
                //There has to be an easier war way to dostChlative path. Use the   var i, part, og: function () {
             readFilne afileNaVariable name, 0, () ]king directory.
      current working directory.
      y = path.replace(/\\/g, '/').split('/');

                for (i = 0; i < ary.length; i += 1) {
                    part = ary[i];
            quire('ble th     if (part === '.') {
                        ary.splice(i, 1);
                   log: function () {
            for eas:th;
            },

            //Remove . and .. from paths, normalize on front slashes
        id normalize: function (path) {
    y(undefined, arguments normalize: function (y to doinihis.
                var i, part, alicense r.ry,
              };


        unctcess.argv[2];

        is://github.com/jrburke/r.jo completely enable this file. Itunction () {
               cwd: function () {
                ratch (e) {
                          //Remove . an from paths, normalize on front slashes         normalize: functinction (/*String*/path, /*String?*/encoding) {
            //A file read func  var i, pat is
 * the sis.requirejsVars.reqexists();
        };

      p
     ieine a ,;

     y,pconn,  .cr, mafunc{}n (pfileNa = fileNaconsole.log for eas{er logging. Don't
        //
        rhinoConte     con     cwd: function () ('-') === 0) {
  ent.     con.keying(this, string, name, 0,    commandOption = fnodee to   convertStnode         log: function () {
           le(),
 a.org/in     convertSt**
 * @license refined' && processy to =      convering(irgs[//A f) ?        cKind.Data :nStream.available(), 1];
ata);
           Get :);
           Se on fs.
           ire/no.proto    .hasOwn;
      ..rea(mapvertSt;
        }
    } elsf('-')p[nodeenv');;
               
        }
    } else iff('-') === 0) ilable(),                  if (convertStream) {
  ne;
        reqMain = rzill        fileNamDuplicat);
      rking directory.
                 ilablfiedonvertStream.close();
                    }
                    if (inStream)Accessor                inStream.close();
  cess !== 'undefine             i -= 1;
                   convertStream.close();
                    }
                    if (inStream)ile;

        exec = function (string) {
   ry,
      } finally       e) {
            return xpcUtil.xpfile(fileName).exists();
        }GetSet function (string) {
            return evlative path. Use } finally |=              log: function () {
           } finally {      print.apply(un
        if (f

         print.          
                context.
        rhinoContee if (typeof process !== 'und.versions && !!process.versio}s.node) {
        env = 'node';

        //Get ire/nos module via Node's requ

        :/requirejs     //gets replaced. Used in re6 The Group/intO
        readFile = ty
     suppd, arguments     };

       xprconsole.log for easils.g !!process.vr existsFd, arguments may not be st[]).path;
oContext.evaluateStr* see: hteName) {
    Primaryithut();

 s  fs = require('fs');
umentroblems with requirejs.execined' ? readFileFunc : null;

     };

quire,
    ponents.interfac       fileName = args[0];

  //XPCOM, you so crazy
                try {
    ces) {
        env = 'xp 'xpconnec             ComponesIFileInputStream interactiveScript, currentlfileName = process2];

        if (fileName && fileName.indexOf('-') === 0) {
            commandOption = fileName.substring(1);
            fileName = process.argv[3];
        }
    } else if (typeof Component      @license r.js 2.1.8 CiveScript, currentlckages: fancy though.
        ifckages: 'thisypeof console === 'undefined') {
                        //Remove . and .. from paths,     nction (str       ary.splice(i, 1);
              }
    }wser = !!(typeof w the comJS 2.1.8 Copyright (c)nodeReqistsForNode =slint regexp: he Dojo Foundation All Rights ResiveScript, currentlright (c) 2010          return false;
        };
 fileName = a   fileName = args[uire      //XPCOM, you so cpeof Components !== 'undefined' && ComponiveScript, currentl012, The Do The UA check is unfortunate, but not sure how
      w/o causing perf issues.
        readyRegExp = isBrowser && naviga') === [) {
            colete
       me)).exists();
   me && fileName.indexOf('-') === {tecting opera. See the usage oStream.init(fileObjme && fileName.indexOf('-') === (tecting opera. See the usage os
//problems withme && fileName.indexOf('-') === /') ||  false;
=tecting opera. See the uspeof ComponentscanRegExp     ap = Array.prototypnodeRequ completely ena        ap =ileName) {
  2    e-xec -= fu, importScripts, setTimeout, opeArgusSync |n either a Javaargine a console.log for eashat may not becense Requir)) {
            coon't
  wser  < length 2.1.8 Copyright (c)ion  print.apply(undefined, arguments);
e);
                } rns
     * a true value, fs.readFreakocess !== 'undefined' && process (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 , sloppy: true */
/*gion hisContext(this.requirejsVaNonComputede/modules/FileUtils.jsm');
                      censeis name, 0, poraable thrtScripts, self, location, Components, FileUtils *&& Components.classes && Components.interfaces) {
        env = 'xpconnect';

        Components.utils['import']('resourc    }

      exis   * Helper fen: true.s.node) {
        en   }
    }

    /**
     *hisContext(this.requirejsVath - 1; i > -1; i -= 1) {
 exec()/transpiler plugins tier logging. D strict.
/*jslint regexp: true, nomen: truens.node) {
        enlobal window,    for (i = ary.leewroblems with requirejs.exec()/transpiler plugins(typeof wnewtion hasProp(obj, prv = 'node';

        //Get      return h normalize: fu.real) {
       exec = function (st?*/encoding) {
 'a  /**
  '        //gets r       contexts = {},
        cfg = {}, str[ value, the     }

    /**
    '[object Function]';
    }

unction getOwn(obj, prop) {
      exec = function (stAllowCh ||h requirejs.exec()/transpiler plugrict = !!(typeof w      ? {
        return hasP {
       */


(function ( logging. Don't
   var i;.
    function[
    function,
        cfg = {},ntexts = {},
        cfg = {},s over properties in an o           try {
     if a function for each
    ach
     * prope     normalize: function ( value, then  }

    /**
    Scripts !== 'undefined',
        r easier logdy, detecting opera. Seenot already have a property of the same name.
  exists = funct normalize: function (c}

    :quire normalize: function (ore/no force, deepStringMixin) {
 t:ts=4:ssource)th - 1; i > -1;     eachProp(source, function (value, p               } catchasProp(target, prop)) {
                    if (deepStringMixin && typeof value !== 's (string, name) {
                 if (!target[prop]) {
                    ength - 1; i > -1; ile read function that can deal with BOMs
 oppy: true */
/*global window, naviif (hasProp(obj, prop)) {
          (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properte into target,
     * but o            if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value !== 'string') {
                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.protoName) {
  3 Postfix, importScripts, setTimeout, operURL wit is specified
    //first, sinnc) {
  j, prop)) {
                if (fn (pathents.classes;
        Ci = Compo) {
        console.log('See https://github.com/jrburke/r.js for ulobal windisBrowser && naviga) {
    ++
    function--eturon cpeekLineTerminon A(turn fn.apply(objer to a.1,r e = 2leName.indexOf('-') === 0) eString(this, string, name, 0, ndeRequire = require;eStrinodeDefine = define;
 }
                    if (inStream) {
   LHSam {Strquence is 'loadin:sts=4
 * @license           return rh    e.requireModules = require if (inStream)InvalidLHSIny(undefine  e.originalError = err;
         mixin(target[prop], v       //Get Updatjslint rege normalize: functi,
      s\S]*?)\*\/|( normalize: functivalue, t force, deepStringMixin)prefix return vm.runIn\/(.*)$)/mg,
        cjsRep in obj) {
            ) {
  4 Unent,in browsipts, setTimeout, operetur
(function (global) {
    var re,c()/transpiler p   fileName = args[1];
        }

        //Set up exeine, exists, reqMain: false, requirejsVarscting opera. See the usage oam {String} id the me && fileName.indexOf('-') ===   function makeError(tream, convertS for iteratingay via another AMD = requirejs;
        rntextName) {
        .4ew Er4.5(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
     {
    e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof r fileName == 'undefined') {
        if (isFunction(requirejs)) {
    uireance(Ci.nsIFileInputStres one.
     *
     * @returns {Error}
   requirefunction makeE
    function~
    function!   */
    function eacMD loader,
        //do not overwriirejs;
       urn;
    }

    if (typeof requirejs !== 'undefined') {
        if = requirejs;
        r            //registry of just enabled modules, to speed
            //cycle breaking code when lot(typeof wdelete
    functi(typeof wvoid from an array of pa*["'oft not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            requireCounter = 1,
            unnormalizep://requirejs.org/d,
      le(), and .. ejs.org/dvalue, ttream.init(inStream, encoding, inStream.availab                   if (inStream) {
    nd ..argv[3];
        }
    } else if (ty *
     * @returns {Errorme it is a config object.
        cfga pointer to 5 Multi      iven;
        }
        cfg = req= 1) {
       ing} id the error ID that maps to an ID       undefEve/**
     * Simple function *
    function 
    function%t not activated.
            enabledRegistry = {},
     Bi      undefEvents = {},
            defQueue = [],
            defined lefif (isFunction(requirejs)righ           urlFetched = {   //Do not overwrite and existing requirejs instance.
          6 Addi             part = ary[i];
         //coring} id the error ID that maps to an ID          if (part === '.'*
     * Simple function of modules
      t === '..') {
                    if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
                   if (part === '.'   //Do not overwrite and existing requirejs instance.
          7 Bitwise Shiftn;
        }
        cfg = req     ing} id the error ID that maps to an IDre is likely
       *
     * Simple function <<
    function>>   * a real nam>his can still fail, but catches the most reasonable
                        //uses of ..
                        break;
                    } else if (i > 0) {
         re is likely
          //Do not overwrite and existing requirejs instance.xt, handle8 Rela comaln;
        }
        cfg = reqe done if t is specified
    //first, sin    quire(     Imessage humaormalized name
sSyncate.a name
  uire and drmalize(namn, srHelp() {
     strict.
/*j      /**
       ing, normalize it to
        * a real na
    function<=   * a real nap, foun(
        functio&&        break;
it neeom an array of painstancwill keep a leading path segment if a .. will become
      2] === '..' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
               /**
       [^:]|^)\/\/(.*)$)/mg,
        cjsRee, applyMap) {
 ormalized name
  xisting requirejs instance.
          9 Equalitrn;
        }
        cfg = req        ing} id the error ID that maps to an IDpendency ID.
         *
     * Simple function =p, foundI, fou!p, foundI, fou=     if (baseNameisFunction(it) {
    normalizedBaseParts = baseParts,
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative pathpendency ID.
            //Do not overwrite and existing requirejs instance.
          10 2] ===         ;
        }
        cfg = req       ANDing} id the error ID that maps to an IDa top-level require *
     * Simple function &) {
            commandOption = fileN  normalizedBaseParts = baseParts,
                map = config.map,
             '&'    //End of the line. Keep at least one non-dot
         a top-level require    //Do not overwrite and existing requirejs instance.
          //Convert baseNXORing} id the error ID that maps to an IDt baseName to array, a*
     * Simple function ^t 'directory' and not name of the baseName's
                        //module. For instance, baseName of 'one/two/three'^ maps to
                        //'one/two/three.js', but t baseName to array, ay, 'one/two' for
                        //this normalization.
                       normalizedBaseParts = baseParts.slice(0, b       normaliz*
     * Simple function |t 'directory' and not name of the baseName's
                        //module. For instance, baseName of 'one/two/three'|            //Some use of packages may use a . path to reference t       normaliz     normalizedBaseParts = baseParts = [baseName];
               1    } elLogicf this normalization is for a de       ame to array, and lop off the last part,
 pkgConfig = getOwn(co   //so that . matches thaat 'directory' and not name of the baseName's
                        //modu       r instance, baseName of 'one/two/three',, maps to
                        //'one/two/three.js', but pkgConfig = getOwn(coy, 'one/two' for
                        //this normalization.
                       normalizedBaseParts = baseParts.slihe leading dot.
          name = name.join('/');;
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.ma&& (baseParts || starMap)) {
                n|
                    }
                } else if (name.indexhe leading dot.
           normalizedBaseParts = baseParts = [baseName];
               2 Con //c if this norm           break;
             D.
         * @returns {String} normalized name
,l(strequenre.js to def {
                g(2);
                }
  when lots ?) {
            commandOption = fileN
        function normalize(name, baseNam') {
                     && typeof valu//this nnc) {
   (undefined, arguments{
            
                //If have a base name, t } catch (e) {
  textName) {
        loader,
        //do not overwrhas config, find if i normalize: functit     orce, deepStringMixin)          :           = 'undefined') {
  exisna               //Match, update      normalizedBaseParts = baseParts = [baseName];
               3ommandOptiorectly to disk. Otherwise, ther(undefined, argumentsequirejs = undefined;
    }

    //Allow for a require config obje strict.
/*jhas config, find if it teration is stopped.readFileules) {
        var   exec = function (str= err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via anoth        .1(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
);
            fileNamLHSIf a define is already in play via another AMD loader,
        //do not overwr                  //   * @param {String} baseName a real name that the name arg is relative
         * to.
         *             }
                    }

                    if (foundMap) {
              4  enva in browsers, #392, and cause /**
         * Given a relative module      //Match, update naking code when lots typeof console === er AMD loader,
        //do not overwrSthis c        return;
    }

    if              iptNodhe
     *   * iteration islue, it will break out of the loop.
     */
 cense Requirtypeof console === 'und; i < ary.length; i += 1) {
                iefined') {
            cStriule') === nunction each(ary, func) {
        if (ary) {
   or = err;
 : functionrequirejs instance.
        2.1 Block     }
        }

   , ap argListCheck for a star lis      return fs.reade, ap arg logging. Don't
  l break out of the loop.
      when lots eJS 2.1.8 Copyright (c)< ary.length; i += : function ()          ame, pkgCfs.existsSyne name to the neiveScripof     //Pop orgs[undefinesegm1) {
                removeScript(id);
            Own(= {
           prop;
        for (prop in obOwn(s normalization.
           hasPCheck for a star bhasPter-input-stream;1']
                 ame, pkgC         var p: true, nomen: true* Available via the MIT or new BSD license.
 * s  ret to [plugreturn fs.readFileSynhasPa   //gets replaced. Used i2.2 else if   to [plugOwn(obj, prop) {
   else if (part === '..Helper function for iterating over an arra= -1) {
                    //A relative path. a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.lelse if Declarone i     name.indexOf('!'ileName &&else if (part === '.     define = unip ofcomple  exists = fame)getOwn(starf('-') === 0) equire = require;id nodeDefine = define;
        reqMain = rif (inStream) {
   Va If t    cfg = require;
       ilable(),     e;
 function (scriptNr eas=process !== 'undnd path           //Match, update name to thalue, prop) {
    isFunction(it) {
   false;
        };
e map
         * for the module name, used tof the loop.
     */
    function eachReverse   * Creates a moe, deepStringMiunde            readnd p: appl name];
        }

        /**
         * Creates a modu var e mapping that incluOwn(confi parentModudoes.
         * @ntext.req        * Creates a module mapalue, since it fail= context.contextName) {
      Config.shift();
                co Node environm}, it will break out of loppy: true */
/*gt.require([id]);
              else if  to [plug name.indexOf('!'dtes a modusobj[prop];
    }

    /**
varer logging. DentModuleMaps plugin prefix,ould only be trus,
         (string);
        node) {
        env = 'node';

        //Get      isDefine = trution (path) {
  tModuleMap:an
           normalize: fuy to do        function splitPrefix(nilablmayning` @par`o Fo`let`     * oBoth     ntMori argaltion not i

  tails
 */    on ye not ap// see http://wiki.ecmascript.org/doku.php?id=harmony: @par     * oion  = splitPrefix(name);
            prefix = nameles[0];
eName segment hasstLetates a module mapping that incluentModuleMap.name : null,
           e mapriginalName = name,
                isDefine = true,
  e = getOwn(defin  normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if ilab    function splitPrefix(name3 Empty      var prefix,
             //Plme = parentModuleMap ?ntModule;s.node) {
        env = 'node';

        //Get ize method.
      function splitPrefix(name4, importScrugin is loaded, use its normaliimportScrme = parentModuleMap ? par strict.
/*jslint regexp: true, nom  normalizedName = '';

            //If no name, then it meansMap);
             ing, name) {
            r        function splitPrefix(name5tstr         Own(obj, prop) {
   Ifme = parentModuleMap ? par  br    //this n,    }
    obj[prop];
    }

    /**
iftion hasProp(objan array. If the fu  brict.
/*jslint regexp: true, nomen: true, sloppy: true                  me = parent           each(scri(typeof wncti) {
            commandOption = fileN   }
    he map config values return eval(string);
        redo that pacomplete|loadeof the loop.
     */
    function eachReverse(   normaliseElement, data     ze(na
                         }
                        }
         }
        function splitPrefix(name6 I 201      to [plugipts, setTimeout, opeDoWn't
me = parentModuleMap ? parnc(paize(namoldIndName);
 obj[prop];
    }

    /**
doer logging. Dcannot be deteon normaliot be determo the new valuunique ID sValue) {
n fs.
        existsFonfig values must
    hing relative
      cannot be determined if it needs
       on't
Normalized name may be a plugin ID due to map config
                    //application in nof('-') === 0) {
            commandOption = f       * This is true if this call is done fo
            //Ireturn fs.readFileSync(path, 'utf8');
= namePart vm.runInThisContext(this.requirejsVa           //If the id is a pluze(namgin idrefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

 ation, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule &&     env = 'node';

        //Get               parentMap: par= nameParts[1];
        FileSync(p vm.runInThisContext(this.requirejsVaFor   * Creates a modulname.indexOf('!') : -1;
            if (       //If no name, then it means it is a require call, generate an
                      isDefine = true,
   ame.
            if t';

        Components.utils['import']('resourcForme = parentModuleMap ? parnd pid that ute.
 ,line.,dot
  me: originalName,
               nd pathdue to ) {
  ath. If parentModu    }

    /**
fo  originalNameer an array. If the func r       return {
                prefix: prunction () {
                       //    oaseName && baseNamlue;
                pathe, applyMap) {
 sage.');
    }
lean} isNormalized:          return mod;
   if (ary) {
       e, applyMap) {
            var error);
    nd p.n
          .out of     1          baseParts = baelative path. Use the efined') {
            he line. =     plice(i - 1, 2);
      t
  ict.
/*jslint regexp: g);
        };

     d path. If pess !== 'undefined' && process.unction () {
                        }
            }
        }

        fun             var mod = getOwn(var ids = err.requireModules,
             if (errback) {
                errback(err   //config, then favor over this starr;
        }
        return stry              errback(erreof define !== 'undefined') {
        //ForIthis file. Ied',
        //PS3 indicateback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
  r = err;
        }ed, and            //retry
                path         normnce is 'loading', 'loaded', execution,
  
         */
        functition makeModuleMap(name, 0) {
            co ID due to map config
        veScript(id);
                     normalizedName func returns
     * a true value,ueue     } els.
                        mod. i, ary)) {
                    break;
    ation, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule &&efQueue.
         */
        function takeGlobaou so crazy
                try {
     {
          normalize: functiapplyMap:                     breaParts[1];
        eue, so ca:') {
   ModuleMap, isNormanew context.Moduleot overwrite and existing require     //them.
        require

  re) {
                 ine. K     , mainScript, t
          eturn fs.readFileSync(path, 'utf8');
each return vm.runInThisContext(thleMap 7trictcontinuegular module.
                C       rl,
                originats = fuabel else {
                mod = get        er logging. D// Optimizng Re most.log('x.form: * @p     ;'not applicable in browser env');
            return false;ver this star map.hing relative
     }

    if (typeof define !== 'undefined') {llegal
         e.originalError = err;
     ou so crazy
                try {
    
                    //End of the li    define[^:]|^)\/\/(.*)$)/mg,
        cjsRequirmsg, err, requireModules) {
        (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        co   fileName = args[1];
        }

        //, currentlyAddingScript, mainScript,        lugin prefix, module
                if (mod.new Error((fileObj && fileObj.path ||e, app  uriSet       ;
        e.requireModules = require   *
         UnknownL    | {};
               //Push all the globalDefQue  normalizedName = '';

                =dName)(id, module) {
                    retmod.module;
                } else {
                    * This is true if this call is done fo mod.map.id,
                    uri: };

     function splitPrefix(name8trict< arygular module.
                B ary             } else {
                        return (mod.exports = def< ary.map.id] = {});
                    }
          < ary.           },
            'module': function (mod) {
                if (mod.    retelative
    ||         Switch   }

    if (typeof define !== 'undefined') {   } eod.ma                  return (mod.module = {
                        id:od.map.id;

                      uri: mod.map.url,
                        config: function () {
                                 var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and         c = pkg ? getOwn(config.config, mod.map.id + '/' + pkg.main) :
                                      getOwn(config.config, mod.map.id);
                            return  c || {};
                        },
                        exports: defined[mod.map.id]
                    });
                }
            }
        };

        functio        var depId = depMap.id,
                      p = getOwn(registry, depId);

                        * This is true if this call is done fo          //being defined, s   }

        function breakCycle(mod, tr9trictnodeReqular module.
                js, re             } else {
           value, t else {
                mod = getnodeReay. If the func re       v  vm = rBodyame via require.normalize()
         *
         Id);

 js, re @license r.js 2.1.8 Copying = fa fo    ed by a space     an iname, 0, nisnsole.log('xnot applicable in browser env');
 am {String} [pare     backwards. Starte in browser  + 1]              errbackreqCalls = s.
                        mod.erro  normalizedName = 'r && window.document),
        isWebWorker = !isBrowser &&         noLoad normalize: function (       if value, t;
        }
        return target;
    }

    //Similnfig: function () {
                    ou so crazy
                try {
    p things that are not enabled or        if mod.map.url,
                        config(globalDefQueue.length) {
                      path.indexOfcense RequireJSfined' && !isFunction(reqEOFes.
            eachProp(enabledRegistry, function (mod) {
             });
                }
            }
    }
            },
            'expop things that are not enabledrror state.
               ion splitPrefix(name10trictwith new Date().getTime(),
       Withme = parentModuleMap ? par      );
        //In Nf('-') ===ame via require.normalize()
         *
         * @parMod         cfg = require;
    !isNormalized ?ithule(depMap);
                if (mo      ict.
/*jslint regexp: true, nomen: true, sloppy: truet may conflict can be separate.
   = getOwn(registry, id);

                     c : null;

           ads.pusegistry[id] = new context.Module(depMap);
    ing = true;
 s                       } else {
  
     Case           originalNam
                         fig.paths, id);
            if (path    * Trims the . an     ) {
            commandOption = fileNdue to ame);
         unction () {
       d.exports = defiareadn a non-plugin cycle.s.
                        : functionfoundMap = mapValue;
 Config && isArray(pathConfig) && pathConfig.length aseName && baseNam         aseName && baseNamk = fa> 1) {
                removeScript(id);
                //Pop off the                   na it failed, and
                //retry
                pathConfig.shift();
                c          xt.require.undef(id);
                contexv = 'node';

        //Get resource t{
                mod = registry[id] =            isNormaliz vm.runInThisContext(this.requirejsVa
     me = parentModuleMap ? pareiame)equitNamk = s, clauseiginalN
     ,
       Fou   p    } else if (!mod.init    c&& mod.fetched && map.isDefine) {
              ict.
/*jslint regexp: true, nomen: true, sloppy: truetream;1']
            Config.length > 1) {
          false;
        };

    }) {
                    if (scrip      breakCyc (mod.require = co            :g is still wa[^:]|^)\/\/(.*)$)/mg,
        cjsRe  });ne a console.log   }

     t with a unng) {
o two matching relalready iue) {
             //If st}
        
            });

            if (expired && noLoads.length)         err.contextName = context.contextName;
           y conflicesource thoand it has not
   meoutI.due to     fudata-requirecontext') ==     //If st             errback(err                        = 1) {
eD       }

     rocess !== 'undefined' && processrker) && !checkLoadue) {
            extName;
       });= {
  meoutI    cfg = require;
     if ((isBrowser    }

     ill waiting on lo/with the plugin being undefined if the name
     ng) {
                //Somet is still waiting to load. for each
     *ss fops =               stillLoading = t3trict    f new Date().getTime(),
       Teserme = parentModuleMap ? parvalue, till waiting on loads, and     f  //scripts, thenmsg, err, requireModules) {
                                New= 'uAfter         cfg = require;
   Prop(enabledRegistry, function
                        normalizedName = normalize(name, parentName, ap              hFallback = true;
                            stillLoading = t4      ry           return mod.exports;
{
  C     bj, 1, 0, false);
mponents.classe (needCycleCheck  waiting load is something
  cripts, then just t    * a true value,    function isAr rhinoCont    cfg = require;
                                 getOwrentModuleMap 14s provided it will
         * also normali, but the name via require.normalize()
         *
         * @par     else if                  } else if (     break;
           egistry[id];
            del    //a nod;

        readFil = function (path) {
ntext.       retur vm.runInThisContext(this.requirejsVaTrmethod.
                        , handler        finalize    se {
                mod = gettry //Turns a plugin!resource  returs must
                    //.
                  errn (err) urns {Objec     //a norm    cfg = require;
        requmod = getM    ly) {
            commandOption = fileN            ;
                            return;cy array,e;

       0(id,             Module.prototype = {
            init:o erroOrFxample(err);
            }

            //Not expired, check f        errb               hasPx.
    

        exec uardedxec rr)     return fs.readn (err) :as be ini                       :  this.ini              stillLoading = t5trictdebugger new Date().getTime(),
       Dns.ignoethod.
                               /s.ignoication in normalrmalizedName = '';

            //If no name, then it meansave option to ini    function splitPrefix(nam               }
            }
             } else {
          ? readFileFunc : null;

   orce, deepStringMi};

 edck =ponents.interfaces;

        fileNamime is up, remembera true value, it will break out of the loopfig.config, mod.map.id + s://github.com/jrburke/r.jthe wa   fileName =             errjs ex';': to wait for complete
       ize method.
    {
                  {  } else {
                    ctly, and
                 (  } else {
                    tap);
               .map;
                } else {
           removeScript(id);
              cjsRequire jslib/rhino/args.js
      .check()
                    this.enable();
             od.err      },

            defineDepd.map.id;

                  }
    ined[mod. } else {
                    
                                }
    e,
       } else {
                    ave option to init   fetch: function () o           if (this.fetched) {
             //If               }
    Modu } else {
                     {
                     context.state, but ime = (new Date()).getTime();

the comor(err, errback) {
        }
    if            //If the manager is    normalize resource,
         ng = fa } else {
                             noLoads  resource,
         the wai } else {
                    ng) {
         map, {
               s.fetc } else {
                                  th })(this.shim.deps ||ry bind(this, function () {
             errbac resource,
              } else {
                    parentName = parent resource,
         ?
     } else {
                     = true;

                context.sted && return map.prefix ? this.callP              ack for a given
                //export can be called more than once.
         strict.
/*jslint regexp: true, nom       2 : defalpa           s {Error}
   eString(this, string, name, 0,         }

        xpcUtil = {
                  throw new Error((fileObj && fileObj.path ||   return  c || = id;
        e.requireModules = require   *
         Ren
         , ': def' the module  e.originalError = err;
        return  c |[= id;
       ue) {
                      iout', 'Load timeout for modules: and ..n () {
                if             if ed || usingPathFallback) && stillLoadi: defed     //being defined, so still in orce, deepStringMixin)ntext.          i Wait for it, but only
                            normalizedName = normalize(name, parentName, applyMap);
                    }
                } else {
                    3  for a p D/ret     defineEmitComplete)) rNode = fs.existsSync |ame.indexOf('!' in bristsSyn, (!this.defini               direc    ('vm');uire = reqc : null;

    ld: defc || cannot be dete     }

       cannoCycleCheck =ter-input-stream;1']
                   l break out of the loop.
     hould be executed, and it has not
    It is modified by thfileName = pr                pathConfig.shift();
     eck: function !this.defini off the first array value, since it ) {
          xt.requ!this.defini            checkLof (isFunction            !isFunctithis.map                    this.d// indourn; 1);e factoryModuleMap, isNormalized, applyMap) {
            ve factorysSynlice first doing range[0] modBSD lice  //on1] - 1            checkLoer,
            s    ath'
                path define tue) {
            .existsSync;
uire = req          }

            inCheckLoqMain = requirtrigger ano         fileName = process.argv[3];
            if (mod) {
                        //      global
        0) {
            commandOption = f     terror && this., src,
ocess !== 'undefined' && process.versions && !!procescall
      on normalurn  c |nd
       ation, stamp it with a unique ID so two matc not already in effect.
              lt in checking tht with a un checking this module t              @mozio two matching relative
      sage.');
    }
  if ((isBrowser       }
                         } cat           var Config && isArray(pathConfig) && pathConfig.length > 1) {
                removeScript(id);
               if (this.depCount < 1 && !this.defined) {
     failed, and
  if (this.dep      //retry
                pathConfig.shift();
                c                   if (isFunction(factory))  Rights Reserved.
 * Available vi              errcall
      o two matching relative
      cannot be determ       this.shim = getOwn(config.shim,lse {
                         lt in checking this module t being undefined if the name
        //did not have a plugin prefix.) {
              (!mod || mod.defineEmitComplete)) for a plugin managedping that include Compon Compon        gin id  Avail
          global
         mble vi normalize'path');, butndefi               mod = getMte, but nhis.module   fileName = args[1];
       es plugin prefix, module
    ited) {
                        remo //Figuire = require;D license.
             }

                if (!foundMap && foundStarMap)ke sure porarily hide real with BOMs
       usingExports) {
                                    //exports alrea           req.onError !== defaultOnErrors !== t =
                           e, function (value, prop)its) {
    }Reserv     }
                            }

                            if (err) {
                                        
                //Regular dependency.an array. If the func returns
     * a true value,        err = e;
      lue, it will break out of the loop.
     */
                      path.indexOf(':'tory;

                if (errback) {
     ;
                            remoxports) {
                                    //exports alreaould not be caq.onError !== defaultOnErrorr) {
                            //Temporafunction (string) {
            return e  throw new Error((fileObj && fileObj.path ||        BSD license.
                       }
     = exports;

                        if (this.map.isDefine && !this.ignoDu    nction (string) {
            return eval(strevents.error && this if (convertStream) {
                        }

                        this.exports           req.onError !== defaultOnError   if (this.map.isDefine && !this.ignore) {
                     ap;
                                err.requireModules = this.map.iis.defined = true;
                    }

                    //Finished the definr.requireType = this.map.icheck again
       rts;

                            if (req.onResourceLoad) {
                           ed = true;
                    }

                    //Finished the define sta              }
                        }

  {
                    y, so thatame {
                        e.
        (!this.enabled || thi         var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
    ode 0.7+ existsSync is on fs.
        existsForNode = fs.existsSync || path.existsS     nodeR           //Clean up
         Reserved.
  cjsModule.exports !== trily hide require and               be traced for cycles.
           qMain = rs.depMaps.push(pluginMap);

           define to allow require.js to define
        //them.
        require = unde require call, generate a * @param {Boolean} adFile = func                           return fs.readFileSync(path, 'utf8');
        };

        exec = function (string, name) {
            return vm.runInThisContext(this.requirejsVa //specifically. Seqequirejs = undefined;
     fined            cjsModule.exports !== thisue
                      s.exports) {
                                    exports = cjs {
                  ,
        cfg = {},hould be executed, and it has not
          } else if (exports === undefi                 exports = factory       cleanRegistry(id);

                        this.ddy set the defined value.
                                    exporthat.
                            if ((this.even                  }

                        this.exped = true;
                    }

                                        err.requireMap = this.k again
                    //to allow define notifications below in the cas         //prefix and name should already be normalized, no need
     

                    if (thiso this context'sersions && !!process.versio';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        name = this.map.name,
   fined;
        define = undeme = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
leMa4}
  grams called. So
        first array van = '',
        useLibLoaded = {},
 etOwn(config.config, mod.map.id + hed[i]) {
                    this.depMatched[i] = true;
        @para } else {
    }
        rts;
                }
          fix = normalize(p             }

          his.map;

                //If the manager is for a plugin managed resource,
   n
                //exporack: true
              })(this.shim.e than once.
                if (!thited and time is up, remember passing the text, to reinforce
 am);
                    inor);
                } else if (!this.defining) {
                    //The factory could trigger an           //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                               //define itself again. If already in        if (this.map.isDefine) {
                                //If setting exports via 'module' is in play,
                                //favor that over return value and exports. Aftresource. Still) {
          s normalization.
          ext or bj, 1, 0, false);

  or his.module;
xistsSysage.');
    }
      [roperties in an object and calext or //on this module, set up  fs.existsSync |    function splurce. Still
     [id]));a pointer rict(inChe/intxports =      neerConthSynwhquirhe o allowtozed           * othe log(     onnectoryleFunc) {
    vaadd env = '*["',/file- is arf th = Cloc            asserpMaps.and
  ring expndefin', ' env =  must have/filid pos     .map.id] = {});
BecoutIdthe way);

 aatiol    xpconncalln    oftor the  //resou) {
        (if any)         ped twice dug/intthe lex     analysisll Rights      us, ws a de
          t/inta that mo, defineame], loa        retu) {
        n (errd i not applicableextra. //resouct modif> 0s.usingExports) {
  me here since [me here since the plug- 1]define()'d>uleMapeed to wait for complete
 
                //Regular dependency here since t {
  v = 'node';

       aps.p         }
  path) {       },
           //o: [leMap);

  return fs.readloc:

                               breacall env = 'rame.indexOf('!' //reso,     locduleMap);rback env =  funct env = ptions = optie], lo= '       a plugin!                      }


          oadedTimeoutId) {
                    checkLoadedTimeoutady inin browser e            if (mod
                       errback
                ++') {
                   } err, requireMo                     de));

  .ekLoad                    }
    = 'u:== 'undefin     if (part === '.') {
 columnyMapthe -vertee staome             ary.splice(i, 1);
          bledRegistry[this.map.id] not enabled or in er this.depM' err'    ginMap;leMap);ill bein1       var mod = getOwn(regiskLoa      '\red.
  in browser env');
\n
                path depMap ++ill b{
                            defined[id] = ++= 'undefined') {
   rigger inadvertero.
      string') {
                     enable: functiocheck again
        ll be>    t of the loop.
     */
           //Enable each dependency
                 e+=                      //for dependencies do not trigger inadvertent load
                //with the depCount std be some
                   this.enabling = true;

                each(this.depMaps, bind(this,makeMo (depMap, i) {
         val(string);
        };

    his.map.isDefine ? this.map : tl.normalize(path));
     n () {
     n.normalize) {
            the defined callbacks
                //f       var id, mod, handler;

  modu                  if (typeof depMap === 'string') {
              Map.id);

     '\r\ndule.
             andler = getOwn(handlers, depMap.  (this.map.isDefine ? this.map : this.          //Dependency needs to be converted to a depMap== 'string') {
              
                        //and wired up    depMap = makeModuleMap(depMap,
         },
                        exe MIT or new BS'ILLEGALfalse);
        ng) {
            return eval(string);
        };

                    //so that immediate ca) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                (this.map.isDefine ? this.map : this.       var i
   xports) {
                                 //S    on(depMap, 'error',n circular de   }       on(depMap, 'error',d up to this mMaps, b.substr(0epMaps, bld be some Map, i) {
              function () {
                enabled       this.depCount += 1;

                        o //for dependencies do not trigger inadver inadvertent load
                //with the dep the depCount still being zero.
 {
                    var moding = true;

                           thi  retdepMaps, bind(this, func (depMap, i) {
             wired up to this module.
             i, depExports);
                             }

              ain
       enabled) {
                         if (!hasPro moduif (ary) {
           enabled) {
                       locndencies do not trigger inadvt ano:                        contexttion (pluginMap) {
                    var modetOwn(registry, pluginMap.id);
                   enabling = false;

    (handlers, id) && mod t anony        if (this.errback) {
       = 2           }));

         stry[this.           var map = t                                on(depMap, 'error',   eachProp(this.pluginMaps, bind(this, }
                cbs.push(cb);
            },

            emit: function (name, evt) {
        (handlers, id) && mod && !  if (name ===each plugin that is used in
         each(this.depMaps, bind(this, func (depMap, i) {
                           }

            cular dependency cases.
          ) {
                    cb(evt);
                });
              n () {
         'error') {
               {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: funct - r(msg + '\nhttt) {
                each(this.events[name], function (cb      //Now that the error handler was triggere bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
       < ary.length; i += 1) {
             ain
         WhiteS {
 allbacks
               == 'string') {
      ain
          the defined callbacks
               == 'string') {
                 var  id, mod, handler;

                    if (typeof depM== 'string') {
                          }
 needs to be converted to a de
                        //and                        //t can be called more than once.normalization.
     n exis env = Lo

    lready the exports);

tryepMaps, binMaps, b//if a timeout isfor (i = 0; i <ce the parentNammakeMo;ivenm {String} [parentDat =ce the parentNa[i   var cbs = th       enaloader,
        //do not      !isFzilla.org/network/file-inh
    *\/|([^:]|^)\/\/(.*)$)/mg,
  t reliable,
    //o  on: function (name,         //o   /
      //oe in the values since the coliable,
                  be supported, veLi //Removeloc= context.contextName;
       rentName's p                        } else  here since (depMap, t          e,
          collect new        } else if (pMap;

lugi         //opush(mo                env = 'rhino';

  ) {
                    {
                 s.events[name] = [];
    ertent load
                //withetOwn(registry, pluginMap.id);
                  }

    //Allow for tErroradvlit(s === undefior dependencies do not tertent load
                //etOwn(registry, pluginMap.id);
   iteration is stoText only being called once per resource.     //[        //onlyit for define()'   var cbs = the how
                      //onlyit for define()'ontextName) {
    her{
    me's path.
           //do not new pora       *["' return fs.readad(map.name, localRequire, loa load, conf node.() {
            v                    context.isable the wait intervrror !== dereturn {
              Reg Nod, 1, 0, false);
os   id: rs);
ring} message humaa-requiremodule      }

 or');;
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
              }
GlobalQuecall(it) ===          //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length)    op     ormalize node &&whichrce
likelyd) {o Fon is/Use parentName her() moduhe plugin's name is not re takeGlobalQue{
           ion for the come w             //of doing   //only g ex conined' && !isFug expundation A{
                        fileName = args[/ !==reqMain, loadedOpn isFrelative path. Use the cufine() modulo,
           is.map.parentMap);
                        onfine() module: ' + args[args.l      'Regulasts = funct maps to
      path) {   }
.l) 2010-lRequire, load, confi
    wser e         }));

                cont                   }
             callGetMon exis new  */
        function getScriptData(       {
      //Using currentTarget instead of tarion for the c 2.0's sake. Not
            //all ect} cfers will be suppnewConte this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement; */
        //Remove the listeners once here.
            removeListener(node, context    iftLoad, 'load', 'onreadystatechange');
     () module: ' will break out of the loop            onError        return {
        eof Components !== inoContext.evaluatv = 'node';

        //Get c) 2010-     }
             t';

        Components.utils['import']('re      Raw           mixin(config[prop], value, true, true);
                        } else {
                       //Save w:eturn onError(makeError('mismatch', 'Mismatc              mixin(config[prop], valu */
    Mark
        };

      mm) {
err = ehandlers,   eac       //owser aths and(handlers,functio      function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake  dependencies ato ds() {
            var args;

            //Any defined modules in the global queue, intake them now.
           functioepende the comm             e.detaisdefine()'d                  cb(n) {
or depe.ages !== 'undefined') {
     value.exportsFnCount                     nd
        (cfg.shim, functioapply suppalue.init) &&nodet || evt.srcElemvt.currentTarget || evt.srcElement; });.gsuppR         ) {
      misma) {
        grate.
         here.
            removeListener(node, context      }

 L{
                    cbs =s.events[name] = [];
            ertentlue.expor     n = c            //with the depCount ston;

          Count          }
            normalize: function (           deps: value
    var location;

    tsFn = c          pkgObj = typeof pkgObj === 'strin                   }
                        }

          //Push all the gl    shim[id] = value;
               });
                    config.shim = shim;
                              //Adjust packages if necessary.
                if (cfg.packages) {
                    e {
                    cbs =j) {
                        var location;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;
                        location = pkgObj.location;

                        //Create a brand new object on pkgs, since currentPackages can
                        //be passed in again, and config.pkgs is thnodeReq   eac             callGetMotracks
//problems with requirejs.exec   eac;
    }

    //Ala-requiremodule')
        eachPr    if (cfg.shim) {
               ins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: trueports || v')
               lue;
      urn rhrop);
    }

    function getOwn(obj, prop)  || ''this' object is specified
    //first,         .replace(currDirRegExp, '')
                                  .replace it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that expressed in
    //dot notation,          //Done with modiith modifications, a package               }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return targe!mod.inited && !mod.map.unnormalized) {
                        modr
                        //this normalization.
        config.pkgs = pkgs;
          if (func(obj[prop],               //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
          aseName &source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (v!mod.inited && !mod.map.unnormalized) {
                        mod.map =egistry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                 n exisssing  });
           Java curriptDat,
             his.defineEmitted)a.org/in        });
 g exp[            ]     [] :r = e;
      tTargetin     
                        j && fileObj.p(i     ibeing' }

      ed.
 ndlers[deps]Locunction takeGlobalQueu        });e,
              t reliabl           fun(\s*["'of  }

  lers[ed
   lash.nous ae.split('/ (it) =(cfg.baseUrl) {
        n[i                      handler = getOwn(handlers, depMap.de adapcial handlernous rocess !== 'undefined' && process.versions &&               tion (fileName the commwrapT|| 'ing  vm = re node.g       ap, localRequiree.init) &&             Queue
           name) {
   2] ===  });
               ocalRequire)    ng(this, string,&& (baseParts || !== 'undefined'             eng(this, string,2] === '..' || ang = true;

                  the commvisit makeModuleMap(deps, relM           estill waitingdiate calls to map = make.ine.{
                       onError(ma       = function (map) {
            this                  rts =    id +
                                                     f (ary) {
           Target || evt.srcElement;             ine.  }

       ||
      t
    }

      
                             {
    ([])')));
           ?                    }nly :             //only(handlers, id) && mod && !epende          }
         

           }
         ()'db defin     }efine()'(handlers, id) && mod && !              g);
       Allow calling check again
        module                  //retry
                pathn defined[id];
           iting in the global queue.
                    intapendencies as needing to be loaded.
                    context.nextTick(function        '" has not been loaded yet for ceListener(node, context require([])')));
     fg.p             }
    L            //Store if mapfined[id];
                fg.p
                L        ab defines wa          the global queue.
                    intakeDef           Mod.init(deps,|| vark all the deor depees as needing to be loaded.
    {
                    cbs = thication || p         });

                          emalize) {
              if (mod && !mod.enabled) { () {
                 tLoad//Some defines could have been added since               });

                        checpMap = options.skiped();
                    });

                                   return localRequire;
               obalQueue items to this context's
         * dodule name, if itkeError('notloaded', 'Mo        se,             if      context = {
                                            .replace(jsSuffi isBrowser:  existsForNode =ng definmap ivalue, thame +
                   //Done w                         (ure:                   //Some defines could have been added sed) {
        });
me +
                                    tLoagment = moduleNxin(localRequire, {
                    isB         isRelative = segment === '.' || segment === '..';
   map = makeM   id +
                          ve = segment === '.' || segment === '.ap, false,             mod                        callGetMop{
   //Normalize mJava    }

     this, function tError, 'errorm {String} [parenteue:     env =  ret    env = fined) {
      mePlusExt.subs this);
  nd
                //doinurrentTaweNamePlusExt = moduleN                       ) 2010{
             uleNamePlusExt,
     e, true);
                   return context        removeListenmePlusExt = moduleN  globalDefQueue = [ere dires
//problems wihed anonymous definean ID on a web page.
     *to an ID on a web page.
     *         return hasProp(defined, makeModuleMap(      if to an ID on a web page.
     * @param {= getOwn(mapVal  defined: function (i || 'main')
        id = makeModuleMap(efined, makeModuleMap(id,   config.pkgs = pkgs;
                   return hasProp(defined, idcified: func   context.require(cfg.deps || [], c                   }

      =     }

              urrentTarge theemoveLismapValue;
       hasProp(dre is likely
     e module name, like ./some         return hasProp(dif (isBrowser) {
   p
         * for the module          return hasProp(dt baseName to array,arts.slice(0, baseParts.leng                       takeGloba      normal= name.substring(2);
                             takeGloba       normal = name[0]));
                                     tak     });
                 return hasProp(dthis.error);
          existsForNode = fs.existsSync         return hasProp(d error list//if ther    //a nof (mod) {
                h - 1; i > -1//if there - 1; i > -1eners in case the
         s config, find if i//if there is a shorter segmee attempted to be reloaded
 fix = normalize(//if there fix = normalize(         return hasProp(da top-level requir part,
                                          und[id] = mod.events;                     }

                   return mod;
      function onError(err, err];
                        delete                   }alRequire;
       ];
                        delete                  able a module if i         return hasProp(dee leading dot.
                           //Fin
             * awaiting enablem              deletessed in for context         return hasProp(d          if (part === 'no path mapping for a path start         return hasProp(d     return here dire     return h       */
            enab   }

    /**
     (depMap)   }

    /**
             return hasProp(drs.require.mak     cwd: function () {
                    getModule(depMap)K       cwd: function () {
          return hasProp(dam {String} id there diream {String} id thod used by environment ada   }
    }

    e a load    }
    }

        * A load event could be               * loaa synchronous
             *       vm = rd call.
          vm = r         return hasProp(dpendency ID.
              //be relative to base         return hasProp(d text, toy conflict can beuleName) {
                    /**
     ame, pkgConfig, mapValuuleName) {
               esource td = 0;
                    return hasProp(d       undefEve   var inCheckLoaded, M         return hasProp(d     }
                                    }

                return loelse if (part === 

                if (errb               (id) {
                       }

            (id) {
                 = getOwn(mapValis context,
                found an anonymous modul(undefined, argumen                    keGlobalQueue();

      found an anonymous modut baseName to array,           //waiting for it              do fire.
                             normal           //waiting for it               do fire.
                              normal           //waiting gin!reso fire.
                 hasP                      delete undefEvents[id]; found an anonymous moduthis.error);
                                          / found an anonymous modu on to liste(args);
                                      //Do this aftermodule will b of callGetModule in c                                      //of thoses config, find if icalls changes the regis        if (mod.evemod = getOwn(registry, modufix = normalize(                    defEvents[id] = mod.e found an anonymous modua top-level requir            if (confieDefine && (!shExports || !getGlobal(s))) {
                              }
                          }

                   return mod;
                       found                    } else {
           'nodefine',
                            found   if (hasPathFallback(moduleName)) {
uleName,
                             efined, makeModuleMap(id, found an ano                                                nablement. A second ar found an anonymous modu else {
                               } else {       } else if (args[0] === moduleName
                                     e optimizer. Not shown here found an anonymous modu          if (part === '                    ble: function (d found an anonymous modu     return h           }

       gistry, depMap.id);
 oaded();
            },

   }

    /**
                        Module(depMap).en found an anonymous modurs.require.mak       * moduleName may actually b      ust an URL.
             * Note that iKeit **does not** call apters to complete a found an anonymous moduam {String} id thhave already been nore a script load or 
             * internal    }
    }

    c one. Use toUrl for t                  */
            n    [ion (moduleName, ext, sleName the name  {
                var path       vm = r                          */
            co found an anonymous modupendency ID.
                             var found, found an anonymous modu text, tojust
                etOwn(config.shim a file, or if it starts      /**
     just
                orts = shim. a file, or if it starts esource t                    e();

             found an anonymous modu       undefEve                    n;
                        } else {
                         return onError(makeError {
                  oduleName)) {
                            cnd
                //doin module.
           lers[  //retry
                balQueue();

 = ue();

hed anonymous definecall(it) =      }(it) =                                  nodfined) {
      probably needule(args);
         //support old style of unex, module                   oduleNamePlusExt.suers[xports = c function intakemePlusExt.suboduleNamePlusExt.                   return context.nameToUrl(normal                ize(moduleNamePlusErelMap.id, true), ext,  true);
                    },;
                        //If alreadyction (id) {
                                     //to this name, then other anon module
                       //waiting for its completeLoad t                   if (found) {                            break;
           }
                       found = true;
                    } else i= moduleName) {
                       //Found matching de this script!
                       found = true;
         
                    callGetModul(args);
                }

      o this after the cycleof callGetModule in case the result
   //of those calls/init alls changes the registry.
                registry, moduleName);

               if (!found && !hasProp(defined, momod && !mod.inited) {
                   if (config.enforceDefine && ( !getGlobal(shExports))) {
                       if (hasPathleName)) {
                           return;
                                      }
            n onError(makeError('nodefine',
           return localRequire;
       ne call for ' + moduleName,
                                null,
   id = makeModuleMap(id, relMap, false,ction (id) ).id;
                        return hasProp(defined, id) |l for it.
  rop(registry, id);
                    }
                });

                  },

                    specified: f                  } else {
               script that does not call defin(), so just simulate
                    l for it.
                       callGetModule([moduleName, (shim.deps || []tsFn]);
                    }
               }

                checkL        },

            **
             * Converts a module name h. Supports cases where
            * moduleName may actually be j            * Note that i **does not** call normalize on the mod         * it is assumed to  one. Use toUrl for the public API.
               nameToUrl: functave already been normalized. This is an * internal API, not a publion (moduleName, ext, skipExt)      var paths, pgs, pkg, pkgPath, syms, i, parentModul               parentPath;
                //If a colon is in the URLs a protocol is used and it is ust
                //an URL tof it starts with a sash, contains a query arg (i.e. ?)
   //or ends with .js, then ssume the user meant to use an umodule id.
               //The slash is important for proLs as well as full paths.
               if (req.jsExtRegExp.test(m
                    //Just a lain path, not module name lookup, so ju] === null) {
               ension if it is included. This is a bit || '');
                   paths = conf          balQueue();

duleName + (ext || '');
   orts, args);
            //support old style of     ngTo     in)  this map is for ;

        r the cath, 'utf8');
   ul   //because it may iap && hasProp(han instead     objs = {
                    e adap brocharAt(irily hide require anding,
        ePlusExt.substring(indexrse(cod     alloleNamePlusExt          [lla.org/in}

    //Alloorg/intl/converte                   sakey, onl   * @
      sake            fileNa                 ort aMENT_CHARACsakep = map;
            thin br                   //No ins  enabledRegileName =        r the context? 1 :((evt.currentTar        (evt.currentfrom the srcElement).on fs.
    uff                             config: trueize(nam'string') {
        urn  c |relMram {Boolean} apCycleCheck =                     unique ID s         //Pull out the       return vm.runInThi.map = {};
   err = e;
      ded. This iNot
   y, only non-.js things pass
                                         //Sobight (                 },hed anonymous definetLoad,     }
         xin(local        /**
         ', 'onreadystatec context.        }
           w

            /**
           w                                                   on**
               nction takeGlobalQueue             ndenssary.
                if (cfgback(data.id))        en              return onEistener(keError('scripterror', 'S          //Usior: ' + data.id, evt, [data.id]));
          tMain =                 return onErrain =   context.require = contexeed.
equire();
        return conte      cjsRequirhe plugin's name is not reliab          //I     con   //retry
                path    rurn c;

to    vernt isa    * @.      is good as fastdex,h*
     * If the firstTarold IE         //rsplids    * @Exp.te   //o     * @*
     * If the firs       sndencyr += 1); callback        ll Rights ner(name, funrt and still makes sen       location: locatio            es senOfback) {
                               // Fo    ale;

            actr) {vianectA    encies are available.
 for the appropriate context.
     *
     * If the f                * @param {E === 'load' ||
is.map.parentMap);
                        ex, modjsModule.exry     .createInstan load call.
                      //of d converted t, 'error', only non-.js things pass
     makeMt}
         */
       {
                g,
   xt.makeRequitError, 'error();
        return context;
    }

    s a bit wonky, only non-.js things pass
    e call.
  .
             y(deps) && typeof deps !==         r', 'Script // deps is a config object
            configs a str;
            if (isArray(callback)deps !==s a strin   callback ();
        return context;
    );
         see if there is a path
     ck = optiona     excial handler config.cont.id]
                    } .
    (                r     /* Callback }  thislar context, confA module ction (evt) {
     err = e;
             * This is t         }

           Sync      package.js    }

 exports.ver       '1.0.3'  var d (config2.0'sd call.
  var d// Deep cop     *  (configstringrorse.init) && !value.expo     tStreme;
id];op(cfg.shim, xtName;

  new Err               },

            /**
     /**
 nfig() to mak               l           tTargle(),inis an e
                   string,            ret
        e.requireModules   /*         stringinally        //Push all the globalDefQueue items innew Errfreezke it easier to cooperate with o loop. Overriame;
le(args);
  ine() function.
   lutiePlusExts);
 }   //* vim: set sw=4 ts=4 et tw=80 : */
/**
 * @    nse Copyid) {
(c) 2012,     Dojo If ste);
  All Rt
  s         ..nexAvail     ve athe MITo Fonew BSD Tick = setTisrope = spligithub // /jrburke/requirejss.
  details
    
/*global/As   // Ref    y if it.nexxpcshell has themreal     ck o  prnuxe whewindows (1MB vs 9MBrequmacdefi*e whethe recurs    nature    csp   } cax.js    int isoverflowrrorttyrsioquickly. So favort arbuil);
  dy exist2.0'sr:rsio = ss://devel  pa.mozilla     en-US/docs/SpiderMonkey/Preq.i_APIly ifot alr(' dependAdaptules.['./ dependes.
env'    .init) && dependnamevocal reqchronov.ge         xpconnet isgment = mody exist, only non-.js things pass
nodeReqdy exisePlusExunction () {
   unction dependePlusExtcont  newConuglifyjs/    olid     , ["e as a ", " (confi  //modul   //./2.0's-jnce f./proe;

"e default c(e as a  the onfi, rom coocalreq.next        typeof setTut ! RobarraGust-Bardon < = splirnce o.gthe befaul     >setTimlltrue;
snste     setTrsioRedilbacbu      nd that         {
   b  } el            orConteoutrsiomod  }

    ex =e p reqtport.enterConthacom/jr         /cduleNamenly ctx.rme    rop] Brow] = function () s outp Caja           rbut r the abo    sBrows    eof setTnotic

      Own(c
        };
 on;

             gName('hea    laimtrinf (isBrowser) {
        headin= contexts[dcument.gproduce);

 sByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE;
      doc/**
 e);
  and/ strthe    teriaonly nfig && coterConontexetEleunction () 6.
     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER "AS IS" AND ANYif (EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,   }if (xplicitly generate OF MERCHANTABILITYy errFITNquirFOR A PARTICULARif (PURPOSE .parDISCLAIMED. IN NO EVENT SHALL   }
    }

    /**
  BctionLIABLEhandliNY DIRECTs wi     * CreCIDENTAL, SPECIr thEXEMPLARYersioOR CONSEQUENTIAL DAMAGES (will be passed to this
     * @paraROCUREM
   OF SUBSTITUTE GOODire eSERVICES; LOuireF USE, DATA, O @paraROFITS;sed BUSIror hINTERRUPTION) HOWEVER CAUSErrorD ONrors thaTHEORYig.xrrorant c, WHETHERr obCONTRA * CSTRIC thi) :
           TORT */
    req NEGLIGENCEsed O    WISE) ARIS.typIxhtml WAY OUuleN', 'htmxhtmig.xaseElement.pa,ct.
  IF ADVIorg/et = E POSSIwant cu    noSUCHvs.
   6.
 if itq.nextfilelreaview Enhlit(s <a href="ser = is    * Expormishoo/U
    JS/"if (>    * Ma</a>
     function (        map iright (scri    hose path)    * <p>Also portsd asaliadard//If BAfeilter requbeen depre    dr diad a modit.
ule f://closure-lue iler.googlempliaxpor">the Cam {Stretu} modate fsi    iodul*returial relecle.      t aris unaeout(fn, c(namthe <abbr titlee.
           ages interface">CLIate willthe module.
     */to loexecet islog    t} urlflode.g/If BArly bin. Ial(sttra(nam      mp //Deflow otdoe      intved. Drsion;y;
         = name,
    in  does n         derives * to overrideq.loat} urname, 0, n };
s    ed astance(Ci. standors.</p>it.
   .inio allowngfied to ex falworsor the d    lue t();

  me);
y for afindBrows module f://tools.ietf     html/rfc2616#sactoon-3.5">encomodut} utrans    low oate fonnepplied.are          ,ind state.
     * @parpliajqueryExportd scr-1.7.1.js">jQ scr iringate ftakes 248235 bytde it.
Builmodulit
     ad a module for the browser case.
     * Maktarball/v1.2tacht} u    * Ma which ate fstead de = 93647the be (37.73%therthe prig    )       a    *r th    ('dataocalRe33154script r13.36after the script exudardind state.
     * @paire =.die.net/man/1/gzip">ed-i(1) var cr of all other br     am See:) {
    ofthe onloadhich se def {
                   //In g is ito allow oSee:a
         8078connect.ma    rto tot f12863the be, i.e. 13.74%aths     ariscript
toetailsfor     ioned    //scriptexecution. :
            //https401       See:(    non mode.
 859      if (nod2.59achEvent &&
                 //Check iSee:s://connect)ext', contexWrre[p
   rowsers with
 ://es5.    * Expor#x4.2.2 of th       t tagntate See:ofuirejs/issues/187
              ">ECMA-262 5.1 E       var cEvent to finduleName);

            //Set up load lis3629">UTF-8 var cFinCheload a mod.
     * @paleName-stylegui    eName the namesvn-history/r76/trunk/javname);
th no xmle thisReonEron 2.28fter theGeName JavaSme);
 S" wi Gh noate f(t to as.
  th See:    ourage      ter the{@     efault c} ta| {},ent.toStringe.set {
 Of('[) it.
100%paramdvent.toSind state.
     * @param {String} moduleName the nameDoes, fu     *-ut !0123.tar.gze thisg = (context && cV {
    174that ext', contexShould you  thive   //oftws aruseful, p to tion tcontils/648057/script-= ispaypal namecgi-bin/webscr?cmd=_s-xclick&hosted_button_id=JZLW72X8FD4WGe thisa donE9 has
  ext', con@authorppendCh.me@R thedefault(ance of the defaul).nextsup
   ed Tebein
    sBrow   n<ultive   nodli>irejs/issues/187se, js      ist/v0.6.10/">Nrt acriptLoate ,</liattachEvent('onreadystatec           //addEventListener support, which fi    * Maif (baseEl event for. //It would be/e.attaif it does nollow e: (stricontext.:tring   //so      //e as a           rejshint subor ha    req.next.contextNe brenvironments
     * to override feckLoie cal', modction (context,a);
 act squire(tree">AST</not
fig ge@      {!TstrincticCodeUnit} oA   //usstringTree Ashort
 -  /*       if (baseemoves/Chedulecannot
            //use that pathway given the connerop], vaosoft.com issue
     ed above about not de 'script execute,
   if (base            //then fire the script load
     itsed, then IE will fiif (basee error beforeollow the   setT/
    ODO(us  cot.contextNa not fmatheIE9      before load, b n (filefied to e.E 6-9.
        Unollow the scr            } el        //node.atorted.
  6th        req.s.ne
            } elRewrit     ', context.onScriptL.
t,
    ['ast_all installfunc) to defau           //mentioocal r           /();
addEventLb      or handcurlyor handeqIE 6or handforinor handimmedor han         /allsefor handnewcap   //of oargsome cacnoe//Plecution, newfore the end
  onevaror handplusall or hand   }
appendCh  //ror hand      fore the end
  iste     //trailingener
    
);
   _the end

    clear * A //Uars,ine cs execofttribuabout.confor mohis
 var cconsole = clear aft@ @parruc    
         no caleffecodule to t*/ElementT fs.existsSync     lse);
     ocal req varbut clear a aft     ategoryhEvent.tpt = node;
           *["']{ modulle name. Itctivee Ee load.
     Cad.appls
 */
//Not.insertBefvalue.en       ).enpt = null;

            .N_iptTyk) {
      
                h moduln.
 occurrde.gs (onteElementconsole ) out ach epen//corrrentlyAddinjs filctx, c     befine installs of        }
       !     .<mod.map.<lback ,, use i>>urrentlyAddi;
        } elsaCou    //bjsModule.exever, if w[E nameToUrl: funct       try {
de foIFIER_NAMES     = e;
                  //are in play, the expectation reatNG_LITERALs been done so that
                //only one script needs NULL_AND_BOOLEANloaded anywa);
        re = e;
       //In a web wor name, 0, ne.setA load,s is not a very
   ll block until
             lback oaded and evaluated. However, name, 0, equire();
       //In a web worize(),ede 'script e);
     * @ad =         //effif importScripts, impl block untiall installsunt for anonymous modules
                context.completeLoad(moduleName);
        nam//corVbeforerror for: ' veScript but clear after the DOM insertion.
            a                              'importSipts failed foe;
            if (baseElement) {
                head.insertBefo              nt);
            } else {
                hdiis n    nElement use import requil symbolrequtwuire the script l block untiingScriturkeative coconfcution
                  all installs tstrtoStrentlyAddin
        }

s contexry cractive') {
         fs.ne callfor orthon't
           }
            currentlyAddi;
        } elseSav      (evt.curren //In a web worA         retule(),ter thet tag
   ctx,  runningn
    ribu    rgs =   /entlyAddin }
        });
      er the       });
        returipts will block until
     lback  a data-main script attribusporaenable: funct                         [moduleName]));
             tx, ais anpts(), funt for anon      ofElement) {ingScript = nod//Figu fs.riptstlalse;
     urn inte;
            if (baseElement) {
                head.insertBeforeln () {t);
            } else {
             An        whose= Cc      ) {
  ror(makeError('importscripts',
  he script ta                             pts failed for ' +
                    entlyAddines the befores arcorresp in ng            ts the               odules
                 //its script i{te, whi
         we caeckL     oaded and evangScri=== 'interactiva data-main script attribuo                        importScripts(url);

ipt;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'inte: fu;

  activeScra path (i.e. cont'importScripts failed fo           }
            currentlyAddingScri=== 'interactiv#te, whia data-main script attribute, whi    (evt.curr                      onfirly bin strode]                //then fire the script load //AccoElement) {inthe onloae;
         0) &&
   Element) {

      TP        le name. n script o         rors/*me.
                m */does not('early bin')defined, but clear after the DOM insertion.
 a   eachReve @para;
        'script interactiveSipt = script);        eachReverse(scripts(), function (af (script.reaonteElement) {a       ede thatom ieateNoud padyState =script  ===           //like a module name.
        //its script is downlmainScript = mainScWeed.
      config:  interactiveScript;
        }

        eachReve*
 * This     as a kLoad {
 b|| 'x) {
       }
noyTagName('getElem            Main) {
   <p></in >'[]'ect to int'.t a stri<ener >xt', cinal baseUrParts[0];
   }

    //Look for a data-main script atN_PROPERTY_ACCESSOR: 1the end
   //In a web worker, use impor    /**
     * The functapt tag
            no       kages can
  url the (newm
     * require() in t:t a strin+     the module should be the first argument,
     * and the function to execute after deVARror;
_DECLARAS('h: 2d should
     * return a value to definrse(scripts(), fu * The futoser so useing to the           if  var founattalu all otsg to the first argumen@ret        * require() in tJavak) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name STAT modu_AFFIXtring')4{
            //Adjust args appropriately
            caa depento enram ddingScript = nodaMain) {
     is noaeturn eval(: fuontexno options)  beforey, th          's
     * name.
  so to      eileN@retue may not have dependeps, callb(){tion}k) {
        var node, context;

        //Allow for anonymous modules
        if (typCLOSURE: 17   cfg.baseUrl = subPath;
             efinecument,ule') === nq.load       path (i.e. cont//FigetInteractivs, importScripts wi //Pronfig if            //like a module name.enum       currentlyAn script //are in play, the expectati              return true;
                 /ttribute('data-requirecontement,
     * and the function to execute after dethat a build has: 0d should
     * return a * to ovError);
  ent,
     * and the function to execute after deto be loaded anaded should
     * return a 012,t in right ( and module. Avoid doing exports and module
               other use cases become co:        /                      t.onErrth) {
              .toStripts, importScripts will block       e error beforeter the    //bs               
            and to g', 'exports', ');
            1);bthe ato ficrip

         //retryl, do th) {
   Element) {code] then Element) {sues/187wwwfix(n-url)  //reaal     pub
     ons/h. Anards/E= cu262.htm"Element) {ported.
 nreadxp, '')
                    .replace(          //Setp, functio     deps = (c             deps.push(dep);
        moduleName, urnction (script) {
            //Set the 'head' wS  //wor: '#S maps to
  ;
                }
        fun         //R. contains '?')
          .getAttribute('data-requirecontYMBOLIC];
 O  * Set .
            if (callback.length) {t.parentNode;
      ermncat(depir    ropriatenesncatElement) {h, whicing deback.length === 1 : ['require', 'exports                  .replace(cjsRequireRegExp, functiot = null;

            quiremodule');
                }
               console       n= nution (cnteractive) {
              
                 = tr">oString];
 } @para        le. Avoid doing exports and module
               WITH              //could use exnd get it processed
        //in the onscript load callback.
        (context ? context.defQ5.hich1 : globalevalueue).        node.sele. Avoid doing exports and module
               EVALaded should
     * return a nd get it processed
        //in      b (ree onsdq.load = frly bine. Avoid doiunland     whole scop     exametryed for transpiling
     * loader plugins, not for pXll bor;
') {
            //Adjust ar   }
      t.parentNode;
   1);contxecutthe iblelse)ent,
     * and the function to execute after deiptTy: 3   cfg.baseUrl = subPath;
       SE tag iied to ex(')[0];tha (scri* to ovonachEveis a path (i.Element) {,
      anre'] : ['require', 'exportst argument,
             context.completeLoad(mn script Aefine:_me, url) name oaded an   e: require'd, t',            fun       e: require'sage.*/

            //REQUIREStoString(age.}enclosed wi test           uses problems if the so    //text is//Set (jsS: req       //is useFunctainScript.split('/');
    l, do the data-main scripe: reqnnect.microsoft.com issue
      oft.com issue
   ned above about not doitext, the 'script execion thanchcat(deps    //use that pathw'GET', url, true) xhr.open('the data-main script longs the issujslincontext, ath = src.length ? src.join('/')n scrim the specEl: truoft.com issue
   (ar xhr = new XMLHtocal req o this node,   }
        }

 (thind         e*
 * @leon () {
            i 'script s req.createNencies are ame.
            le name. It n script at bIsGdoes nure oplrows' somear xhr = new XMLHtjust: require,Load(moduleName);
            }
          /*jslint ev      il: true */
              /**
 * @license RequireJS rhino CopyrWholly           = !pyright (ights Reserved.
 * Availabl            //next script' that ott.parentNode;
        @paritute ahub.com/jrbure.load = function (contexule name.
       oft.com issue
    ense RequireJS rhino Coo fs.existsSynca: false, load: false */

(fr the DOM insertion.
                 essed
        //in t= function acti }

           ttp://github.com/jrburke/requ!ore(node, baseElemeodules.
        context.completeLoad(m    ights Reserved.
 * Availabla
   slintter the, url) {

        load(url);

        //Supslinodules.
        context.coslina: false, load: false */

(fune.split(aMainain becomctx, ontext.    tra) {
to l*jsli browsee script tag           //then fire the script load ev(url);

        //SuWalk currentlyAdd     context.cr assua: false, load: false */

(funnext scEvenmpt fr
          head = /Mark this call           define: falseobal require: false,se, requirejsVars: false, process: false */

/**
 * Thi/like a module nas = cfg.deps ? cfg.deps.conca ? cfg.deps.conca        /...[*])loaded and evjs has loaded it andtext, use the served.
 * Availa afters limited equireJS
 * usage from within survey */

/*j this.        fs = noymous modules
     
    'use strict';

    va = cfg.deps ? cfg.deps.conca    req = requirele name. It doeJS rhino Cot.co,
   e load.
             deps: val/**#no/in +*/stricJsDoc Toolkit 2.4.0 hinscrsorowser) {

   encies are avaie,
        fs =  reqult fr          this.requirejsaevil= nu     if oththe brown syncTick(fn) {
isBrtEleatoStringDefQu         nara) {
 vironment-spic call. Onn syncTick(fn) {
y use    n();
         nodter the          ad, tlobalm                    mments f         /E tag i        node.setA loadencies are availnnect.micr    //S backwards. datio      if (moduleName === "eq.onError(new Error("Expl  context.comple aF| mod//Temts f varare malorts" || mo"));
        }

        varsoft.com issue
                } ce the nam== 'rhino') {
  asOwn = Object.pro () {fun':| path.exihandlers, id) && mbackwards. ed();
                        moduleMaped();
             
        //Noocal req variable tf       yAsEan implem // Adjust args if fAdd(part === 'backwards. // Adjust args if            moduleMap.forEach(efined) {
    // Adjust args i                tion syncTick(fn) {
I    de;
    Presf weter the use importScripts. Thter theortscrq.onError(new Err importScri eviquival    /leName/this /

/*jrse(scripts(), fq.onError(new Err function (contet a vnxtTic intec call. Only used for tran      exct.microsoft.com issue
        if (hasPaoppy o    (scriq.onError(new Err      exists = functeq.onError(new Error("Explicit require of " +e canmoduleName + " le(),ttributehin the requirxhr.open('('data-requireconTick is syncTick, t listener     }                 
        xute,
          hronously.
                     //Best hope: IE10 fixes the issue    //synchronously.
                        lojs direcgithub.com/jrb contains . or ..
    otmoduleName =           ,e]);

          d[moduleName];
      tTic    }
    }

    /handlers, id) && mod//are in play, the expectation that a build hased();
               ibute('data-re.ontext') +                  prefer that.
   nodeReq[     ,d it and.walklse {
      )                 ntext.nextTick(fTick = context.nextTick;
           ire) {
  Not
  al       if (moduleName === "require" || moduleName === "exports" || moduleName === "module") {
            req.onError(new Error("Expl?icit require of " + modu will
                    hronously.
          allowed."));
        }

        var ret, oldTick,
            moduleMap = context.makeModuleMap(moduleName, relModuleMap, false, true);

        //Normalize module name, if it contains . or ..
   p;

      duleName = moduleMap.id;

        if (hasProp(context.defined, moduleName)) {
            ret = context.defined[moduleName];
             //to    ed, and
am, encoding, inStream.availabdefined) {
                //Make sure nextTile name. It does ck for this type of call is sync-based.
                oldTick = context.nextTick;
           Ei)[0];     context.nextTick = syncTick;
                try {
q.onError(new Err              funoroff evaluating   rc       fn(rocessed
       q.onError(new Erra     t of, true); (context, moduleName, /nextTick is syncTick, the requicit require of " + moduleName + "            uleName = moduleMap.id;
          };
  process.ne so
    //that it survives lat    -1 globttp://github.com/jrburke/requi.  //NOf('Shim confighat it survives later y fetch it.
                        req.loaoad(context, moduleName, moduleMaother use cases become coed();
                 able the module
     //Th              deWrapper = functio             i -= 1;
    and int-sone le so
    //that it survives laterJS node Copyright (cse if (isWebhandlers, id) && mod && orker) {
            try {
plai(handlers, id) && mit is already enabl execution.
    req.makeNodeWrapper = function (contents) {Tick = context.nextTick;
                   fn();
    }

    //Supply an implementation that allows synchronous get of a module.
    req.get = function (context, moduleName, relModuleMap, localReqq.onError(new Error("Explre will complete
                   text();

  no Cohronously.
          
        toluatnodeRefig.suppress.nodeShim)) {
         him) {
       } else {
      d[moduleName];
        } else {
            if (ret === uTick = context.nextTick;
                context.nextTick = syncTick;
                try {
quirejsVars.define));';
    }* to overridfig;

        if (config.shim[modulortscractive', 'module']).co Rights Rback can
     * be s      blems ifs || !config.suppress.nodeShim)) {
             //tnsole.warn('gistry[modug not supported in Nodeame;

      r the context.
            e: ' + moduleName);
        }

        if (exists(url)) {
            contents = fto be loaded an');

            contents = req.makeNodeW         me;

       ror: ' + e);
                err.originalError = e;
                ire) {
        if (m      res.
  ript to allowuleName === "m  parentMap = mapdule") {
            req.onError(new Error("ExplleMap, false, true);

t arAlugin!r
       itiveutionkages can
            t to allowFountScriName, function () {
      to get a      moduleName + " g.nodeRequire || req.node                     et it + moduleName +to       t
     to alloName, function () {
                //Get the ofig.
   mainwill
   + moduleName                      //resont-suxt toregardt) {
of     }
  ript to allowtScriduleMap(moduleNameains . or ..
    ? thse);
      Tata(' +
  ,   err.org not supported in Node      isram {E' +
         'for module: ' +fined) {
     ' +
  [0tched anonymous                err.originalError = e;
                err.moduleName = moduleName;
                err.fileName = url;
                return req.onError(err);
            }
        } else {
            def(moduleNuire) {
        if (modu     aseUrl. G        //leName ===                 "module") {
            req.onError(new Error("Expl              ,
       isDefine = true,
  {
                           tified = falsr(err);
                }
           | path.exiSD license.
 * see: httpd[moduleName];
        } else {
            if (ret === undSD license.
 * see: httpcall is sync-se if (this.events.  err.originalError = e;
                err.moduleNrocessed
        ontents, err,
           DefQu                 push([name, deps, cacTick, the require will complete
               Aon tri relative requires may be
                //reso an arr //Comng t        modiire/noddataMain) {
  can regenebecll(oion tiataMainext scMain
 ewis adapterviro= arg                      the DOjsSuffixR//resourest(fileNam+ '" at '        //the dependencmmandOption    //resoexec                        err = new Error('Tried loadi  var founa
    var foun//res                       imizer        augresoed
    }

    /**
    p
                        //to get ver.//Plu      lReqt   onErs directos
 */

/*jslint */
/*global requi    }
      } else {
        on loadLibocal req variable t   } catch (e) {
             luating ' + url + ' as modul    ntext.enable(moduleMap, r        //Break a
    function hasProp(ob-, prop) {
        return hasOwn.call(obj, prop);
    }

    fuveScript = nule,
        fs = nodeReq('fs'),
        path = nodon't
     tion caln
     /Mark this
 */

/*jslinstsSync is on fs.
        exists = fs.existsSync || path.existsSync,
        hasOwn = Object.prot               sy;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function syncTick(fn) {
Oretch    rel req/node.atuffigExp = /(\/|^js for detaiName, function () { canner before execute
                //next script' that o           err.moduleNe);
        xute,
                //then fire the                      : IE10 fixesGET', url, true);n () {
            if (xhr.reales that can be used fState === 4) {d.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for de     moduleName =d[moduleName];
            //Support anonymou    ontext.enable(moduleMap, r        //Break any cycles by requiring it normally, ((typeof navigator !== 'undefined' && type        //I!== 'undefined') ||
            (typeof importScripts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'browser';
    } else if (typeof Components !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect';
    }

    define('env', {
        get: function () {
            return env;
        },

        load: func{
        process.neload, config) {
            //Allow override in the config.
            if (config.env) {
  in that modifies any /env/ path to be the right path based on
 * the host environment. R*/

/**
 *veScript = nLoad(moduleName)Rthe Dntents, err,
           ingScript = node;
          exists =       ore(node, baseElemejsVars.require,
        dare(node, baseElement)  return fs.r, The Dojo Foundatio  //No(
       (script.reao((ty          this.requirej*/

/**
 * Thes beies,Sync        /auirejs/issues/187
                    of Component* >Dr,
      Prologu(node */

/**
 * This adap     currentlyAdd          }
 nion (string.cal(it) ==    ;
    }

    lang = {
        backSlashRegExp: /\\/g,
        ostring: Object.prototysVars.nodeRequire = nodeRequire;
     //Look for a data-ray]";
        },

        isFunction: funcPontext.urn lang.ostring.call(it) === "[object Function]";
        },

        isRegExp: function(it) {
              /an ap: functtring:       hept.parentNode;
            }

    */

/**
 * Tht && it instanceof RegExp;
        },(  //retry|;

   )
        isFunction: funcToights Reserved.
 * Avai  * Initiates the traversal of a source element.
 2, The Do* @param {!TWalker} o All R An instanceCopyrn object that allownse r12, The Dojo * sejs 2.1.8 Copyrn abstract syntax tree012, The Dojo FoundationSe/recticCodeUnit} oSht (cE2010-2 Aight (c) 2010-2 fromD license.
 * seewhichse r.js 2.1.8 Cshould commencjs for details
 return {function():  * This is a bootstraA dified bhe MITis able toD license.
 * seei* @licese r.js 2.1.8 CeJS  a givenight (c) 2010-2012, The Dojo/12, The DocContext = file to (hts Res,ap script to al) {12, The Doj /**eadFile: trunt. It is moe top-level
 * dist.js file to inject other files to complpletely enable this file. It is
 * the shell of the r.js file.
 */

/*/*jslint evil:  var fLambdaomen: true, l readFile: tru  It is mhts Res.walk(rue */
/*global;, Components};
, ComponentsIt is mleUtils, args, rea},12, The Doe, process: fa* Classifiense r. running Requiras excludher fif it does not12, The Dojo contain a {@code with} statRequirorse r.ForNodeeval} identnoder12, The Dojo namjs for detailsslint evil:fdir, noyAsEne, exists*/

var requirejs, requireif unction (consolData.nCategory ===ejs, require,   E script to als.js
  ies.N_OTHERuirejs, require, d by jslib/rhino/args.js
      rhinoArgs = argrgs,
        //Used by jslib/EXCLUDABLE, args, readFinv, fs, vm, path, exec, rhinoContext, Addshub.
        j tose r.listCopye.log('See  = /s found012, The Dojo Foundatistring} sI.log('See Thele.log('See httbe addeusage.');
       commandOpAdd navigator men: true, f navigator= {},
        //Use-1         xpconnectArgs =a navigators.indexOfimportScriptsnect/args.js
        xpconnectArgs =ed')) {
     pushimportScriptsadFileFunc : null;

    function showHelp() {
        cone r.e.log('See opyrivariher filtps://github.com/jrburke/r.js12, The Dojo for usage.');
    }

    if!Array} aV   retuDeclara to iA     returdexists notdocument !== 'undefined') ||og('x.js   (typeof ilog('x.js exists notl readFile: tru) ||
         (/** @typeif ((typeo*/.log('x.js exists not[0]ileSync(path, path, exec, rhinoContext, Incr010-2on (stcou    fn (stnumb      occurr Nods        prefixed12, The Dojo S((typ represents not attributedrn eval(primary exNameser env');
       Foundati    co} gs.js
    !== c.js
    leName.su  //Set up execution context.
         ((typeofNameckagesubstrin      fileName = args[1];
       D license.
 * see:

        //Set up execution context.   commandOpt) {
PascripE up execu   (typeof igs.js
   ,t();

= {},
        //Use! = function (path) {ll);
[gs.js
   ].hasOwnProperty(ileNam
        readFile = function (path) {le(fileName)).ex[();

] = 0, args, readFned' && typeof self !== 'undefine    itiveValue     env = ;

        //Define a le = function (path) {=== 'undefined') returleNam/get fancy thounull;

    (undefined, argconsole.log for easier logging. Don't
      += 1env, fs, vm, path, exec, rhinoContext, donsolidicensall worthwhil      'unde vined' xistsrangvailaght (cD license.
 * see 2010-2stion context.
        rhinoContF * t!== '  en (i injire,
    e, noordpts       D license.
 * see running Requirnject otts rfirstng Requir            tion context.
        rhinoContToit
        //gets replaced. Used in require/node.js
        fs = require('fs');
        la= require('vm');
        path = require('pathboolean} bEnclose Indis.ors whethee h;
      ava/Rhinbode';

        //Ge= defide, Ccxistsfile to icions ith no arguequirs.node)to aD license.
 * seefile to illow an empty oundaeter//githithubyess.versions.nodeD license.
 * seear= 0)rocess.veusage.');
    }
see T=== 'undefined#nSavinghis, string, name, 0, nuExamine script to als   exists = fore ,    ,ne = defil readFile: tru, Fi_ path, exece: true, process: falsle: fat
               sSyncmangledp = /\.js$/,
    ontext.
 env = rhinoCo                  n, Components;

 nI     eof cope.c = /(this.requirejsVars.require.makeNodeWrapper(string),
   s = require('fs');
    ption tly be'utf8');
     timizedLib,sider            re       name ? fs.realpathSync(name) : '');
        };

   Posied b(this.requirejsVars.require.makeNodeWraA collee to iof      reqs uide du   fi=== 0)rocess.vgv[3];leName && fileName.ss.versions.node)and.com/jrburke/r.js     }as p       leName && fileName.accessorfs module viaontext.
 /r.jspanode';

            name ? f!Ovia t.< ((typ,en: true, ...[*])>pathSync(name) : '');
        };

  hts RessTransformertrinonsole = {
      Vars.require.makeNodeW/**
            fis.nods');
    equival('fs' eval(sequ Nodnts !== 'undefined' xt.
termin Javymbol    attypeotitu this fen0) {
f (f,
        jsSuffixRegEffixRegExp = /t ot && !!proc,yrigThis is type2.1.    
 * t = rdoadedOptimizeffixRegExp o args[1     cobracket.path;
   ensode)llow fileNmmandOptFile("CurWorkD", []). = pr sub = argsd bynsole.log('See cwd: toine
 * in es.nodFile("CurWorkD", []). othssign(fileName && fileNam = prppldeReqo {
      ';

       and .usthis fdo          easier way to do this. */

/*
 * This is a bootstrap };

      !== nrue,);
   File("CurWorkD", []).tChaMe  co };

     firstChar = path.charAt(0);

  ((typeof navigator);

     normalize: functrfaces)                firstChar          var i, partfirstChar = path.charAtPackages:onsole.A             de unifs');
    ) {
          path. Use the current workinon;
        }

firstChar = path.charAtn fs.readFileSync(path, 'utf8');
     ame) : '');
        };

    'dot':en: true, s };

     ,) === -1) {
     console = {
      0];

        if (fileName eWrapper   exec = functixOf('-') === 0) {
            cy.splice(i, 1);
       mmandOptiong(1);
            fileName = args[1];y.splice(i, 1);
               }

        xpc                            name ? f ((type                }
            part = ary[ContexsP  exec == Efinedpfile: s.S_STRING +) === -1) {
    leFunc) {
    equire, define, SoluponeBest.o=== 'undefined')sts();
                        }
     fspfile: f) &&        } catch (e) {
  eUtils.File(xpcUtil.normalize([         ].th, 'ut > 0 ?        } catch (e) {
  ['sub'(this.requirejsVaomponents.interfl;
(fun };

     )n (/*String*/path, /*Strin[' = /on (/*String*/path, /*Strinth + ' failed: ' + e);
                }
  
     ] :
            readFile: fun];
 ,ng?*/encoding) {
          ) === -1) {
    ]/get fancy thou     if (fileNamrgs[0];

        if (fileName && fileNa-= 2;
                  oth null   vBodeDef liter                  firstes &&ts-= 1;
 function () {
  (string) {
   islashes
     aths, normalize on fro     normalize: function (path) a to defas to be an easier way to do this.
          com/jrburke/r.js                     path.indexOf(':') === -1) {
 !== 'undefined').split('/');

                forxpcUtil.cwd() + '/' + path;
                }

                ary = path.replace(/\\/g, '/').split('/');

                for (i = 0; i < ary.length; i += 1) {
                    part = ary[in tha           mportScripts !== 'undefine         ary.splice(i, 1);
                    leName = args[1     fi       
        j
                }
                return ary.join('/');
            },

            xpfile: function (path) {
    YMBOLIC       try {
                return new Fil[        } catch (e) {
on that can deal with BOMs
  eUtils.File(xpcUtil.normalize(path));
                          throw new Error(ph + ' failed: ' + e);
                }
            },

            readFile:          encoding = encoding || "utf-8";

              var inStream, f navigator        },

                          fileObj = xpcUtil.xpfile(path);

                //XPCOM, you so     i -= 1;
 function () {
 ict oFile("CurWorkD", []).ashes
            normalize: function (path) am);
               inStream = Cc be an easier way to do this.
              i -= 1;
               convertStream = Cc['@mozi     ffined '/'     i -= 1;
 fileName((typ                firstChar       put-stream;1']
                                    .createInstance(Ci.nsIConverterInputStream);
                    convertStream.init(inStream, encoding, inStream.available(),
                    Ci.nsIConverterInputStream.DEFAon () REPLACEMENT_Csole = {
  

                    convertStream.readString(inStream.available(), readData);
           ss.versions.nod                }
     g),
          
                }
                return ary.join('/');
            },

            xpfile: fun        } catch (e) {
  tion (path) {
             sole = {
                 return new FileUtils.File(xpcUtil.normalize(path));
                } catch (e) {
                    throw new Error(path + ' failed: ' + e);
                }
            },

            readFile: funn that can deal with BOMs
               encoding = encoding || "utf-8";

               var inStream, conv new BS,portScripts,                   filObj = xpcUtil.xpleObj = xpcUtil.xprs.require.makeNodeWraSuch data equionsoton (path) {
  require = requireenv = 'node';

           i -ion (str

        fileName = pr      if (f  ap =lea  }

   = op.hasOwnPropertygre    t known reduargv[3];
        commane r.j1);
           = op.hasOwnPropertyinno oparis          orig
     placed. UsileName && fileName.indexOf!TUtils.Fints.classes;
        Ci = Components.Utils.File(x = new PS3 indic(        //A file rrs.require.makeNodeWrano/aable(), ree,
 ble ngoon,
 ttdefi    find a bett      exec = functi*w !== 'undefined' && navigator && window.documenorker = !isBro= op.hasOwnPropertyser && typeof importScripts  apring,
b com '/'nject oocess.argv[2];

     fileNamewindo !== 'undefined',
        //PS3 indicates loaded and comor (i o wait for cotes loaded and complete, but need to wait foCandg = opplete
        //specifically. Sequence is 'loading', 'loA recorino nsision,
ofototypabounavi,
        hasOwn y,
      f issues.
        reap = Array.prototype,
 e exec ');

                      //PS3function (stno/aates loaded and complete, but need to wve = false;

   f isOpera ve = false;

   /specifically. Sequence is 'loading', 'lolse;
    in browser s for eachin browsers, #39s');
     && tocess.argv[2];

       th) {
  p.toString,
et the fs module vianed',
        //onsol.<    * ents.classes;
        Ci = Componentslog('x.js exists nottrin[]on.
        isOpera = typeof opera !== 'ugn (stra//githire = eam.available(), readData);
   rray. If the func ret       consoljsm');
 >} aLgithA//gith';
    }

    a    vafQueue = [],
        usIt is modified byon () ).js file to inject       r i;
   ray. If the func red lin       for (i = 0; i < ary.length; i += 1) {
          );
        };

  c     vay[i],    };

    y[i]

                   
        if (fileName &&ath.indexOf(':') pfile: fupfile: fuble(), readData);
                      firstChar   f[object Array]';
  cain;

  function for iterating                 firstCharver an array. If the func             },

      , FileUtils */

var req                               cd' && typeo.
       env =          j, prop) {
        retu call(ob retur                          fi\.js$/,
        curdFileFunc) {
    {
    var fileName, env, fs, vm   currDirRegExp = /^\.\//,
        op = Objecction (st    commandOption = fileN= 1) {
           turns shelocess.argv[2];

    .js
         if (ary[i] && func(ary/gets replacedg Requirg ov  env = 'xpconnect';e shell           co0) {
    dOption = fileNamat 1) {
    ray. If the func reArray].toString,
        hasOwn y,
        ap = Array.protoray. If the func reype,
        aps += 1) {
                if rhinoContfileNameit
        //gets replaced. Used in rr function for iteratinopyright (c) 2010-2012, The Dojontext.
        rhinoContext = Packages.org.mozilla.javascripr function for iteratint up execuFileUtne
 * in e1) {
           is deriv    break;
                }
            }
        }
    }

    /per
   ew BSD license.
 i > -1; i -=ddeName have a property of tn fscAddOOption = fIgs.js
   
     * returns a true value, it willeof value !==   exists = ffileName.ntext = Pa  */
    function eachReverse(ary, func) {
        if (ary) {
         Stream.available(), readData);
                   firstCharturns a truthy value                }
            }
        }
    }

    function hasProp(obj, prop) {
        return heturn (new java

   File(fileName)).exists();
                } catch (e) {
  {
               function getOwn(obj, p    }
        return target;
    }

         }
    //get fancy thourop) && obj[prop];
    }
   //first, since it is easier to read/figure out w+: true */
/*global windowa'[object Function][         ]sier logging. Don'tFunction.prototype.bind, but the 'thi                  fil    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function retur) === '[object Array]turn      isBrowser = !!shell stopped.
     */
    function eachProp(obj, func= op.hasOwnProperty,
     ng over (prop in obj) {
            if (hasProp(obj, pr !== 'undefined' && Components.class[prop], prop)) {
                    break;YSTATION 3' ?
                 }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of tIt is modified by    co    if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && t) ||f value !== {
                        if (!target[prop]) {
   'string')                       */
    function eachReverse(ary, func) {
        if name.
     */
    function mixin(target, source, force, deepSpStringMixin) {
        if (source) {
            eachProp(source, function (v            }
        }
    }

    function h   target[prop] = {};
          Utils.jkeys Function.prototype.bind,);
        };
    }

    function scripts() {
  If a define is alrea).forEach(get[prop]) {
                 target[n hasProp(obj, prop)}

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that expressed in
    //dot notation, like 'a.b.c'.
  rt) {
            g = g */
    function eachProp(obj, func) {
        vl;
        eacf issues.
        readyReg         if (hasProp(obj, prop)) {
          });
   contexts = {},
      rop)) {
                    break;
         e = process.argv[2];

        if (fileName && fileName.iimple function to mix in properties from source into target,
     * but only if target does not already have a property of);
        };

    function makeror(msg + '\nhttp://requirejs.org/docs/errdy in play v);
        };
    }

    function scruirejs !==function getOwn(obj, pypeof value !== 'string')\nhttp://ren hasProp(obj, prorDirRegExp = /^\.\//,
        op = ObjecC(typeo       returin browser ll(it= 1) {
           ipart) {
            g = g[part];
       
         function for iterating over an array. If the func ret     if (ary) {
            var i;
            for (i = arfunction getGlobal(vaot a1) {
                if (ary[i] && func(ary[i], i, ary)) {
                  break;
                }
in && t     */
    function 
     * returns a true value, it will break    */
    function eacunction hasProp(obj, prop) {
        re/Used b ' failed: ' + e);
                }
            }j, prop) {
        retu     */
    function {
          return document.g          encoding = encoding || "utf-8";

    n (/*String*/path, /*St[0typeo    retur    env =&& fileObj.path || '') + ),

            readFile: /(\/\* :or new BSn (/*String*/path, /*Str  * which ashes(type paths, but can be remapp.length)}

    if (typeof req[0];

       xp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Objectort) {
art];
        });
  regar  }

    diffeon = Prop(obt, prop)) {
       && navigato1);
            betweering,
typeof importScripts  env = 'xpconnect';nsp =g, '/'ve . anefinfunction trimDots (path) {
            re         //cycle breaking code wh0arget[prop], value, force, deepStringMixin);
                    vm = rgator &&w    .versions.node)e MIT r.pla         if (i === 1 && (ar = !i    }

    /**
     * Simple f (ary) {
        1if (part === '..') {
                    if (i === 1 && (ary[2] =second.' || ary[0] === '..')) {
                        //End of the line. Keep at least one non-dot
It is mos.realpathSync(name) : ''    i<dl>t, prop)) {
                 t>-1</dt         //This can still faild>       vm = r1) {
           mustry[iplac    efor   undefEvents = {},
            ') {
qMainone,</dd         //This can still fail, 0t catches the most reasonable
                        //uses of ..aCont                   break;
                    } else if (i > 0) {
                        ary.sput catches the most reasonable
                        //uses of ..
   no                break;
                           } else if (i . 0) {
                      </           //This can r (i =      * pcUtil.normalize(
     * returns a true value, it wil    === 'undefined'      unnormalizedCou0,          /  */
    function eachReverse(ary, func) {
  !==  var i, par                var inStrea* <o          //This cans {Sli>     var i, part;
   0; ary[i]; i += 1) {
                      firstChar         part = ary[i];
        == '.') {
          ry)) {
                              //uses of . (path) {
  ,== '</liing} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgName, pkgConfig, mapValue, nameParts, i, j, nameSegment,
                   /ndMap, foundI, foundStarMap,.I,
                basePart/tring} normalized name
 ame ? fs.realpathSync(name) : '            }
        }
  nDvar i, par: true */
/*global winda. See the usage o ' + e);
                }
0          -gainst it,
                //otherwise, assume it is a top-level re1             /**
     * Cycles over o normalize   },
 -1 :      if (get<wn(cofig.t 'this' will be.
and calls a function for each
     * prop be aonsole.log('See function= 1) {
           = '.calcul                  i -=  reqMaind.
 * Avt is a config object.
         && ! /**
     * Helper function f; i += 1) {
                if           mixin(target[prop], value, force, deepStringMixin);
                  } else {
      y)) {
       glos.no                   i -=ult for map
      Es that === 'undefined      unnormalizedCounter = 1;

        /*ntext(this.requirejsVa       ary.splice(i, 1);
     eWrapper(string),
                                      charAt(0) === '.') {
                //If;
            },

                /two/three', maps to
                        //'one/tworict: uneven strict support in browsers, #39=== 'PLAYSTATION 3' ?
             }
  es that 'directory' and not }
                return ary.join('/');
  zation.
                  ();

 : true */
/*global windowon should look normalized.
         * NOTE: this method/two/three', maps to
                        //'one/two    commanportScrchajrbu    taken upcrea                        unate, - 1);
                    }

                    name = normalizedBaseParts.concat(name.split('/'));
                    t              //this normalization.
                   LmethoOypeof im=kages s methormalize for that.
                    pkgConfig = getOwn(config.pkgs, (pkgName = name[0]));
                    name = name              }.
     */
  ashes
    ource) {
     lit('/'));
                 //so that . matches that 'directory' and notfileName).exists();                        name = pkgName;
                    }
                } else if (name.Sshes
   ame.substring(1);
  
                    pkgConfig = getOwn(config.pkgs, (pkgName = name[0]));
                       name = name.join('/');
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.main) {
.
  nurn xpe.join('/'       ion () {
                 = namerequirejs.exec()/transpiler p && (baseParts || starMap)) {
                nameParts = name.split('/')    fi= oPro.
     make_normali      s metho    /**
     * Cycle     //otherwise, assume it is a top-level re]may use a . path to refeete
 === 'undefined(n hasProp(obj, prop)do {  // Fte'. ole.log('See un    }tringis   v= unnes    ss = f         //So, do jo      exists = functi hasProp(obj, prop) & baseParts.slice(0, j).join('/'));

                 : true */
/*global windowsts = fnext_       nfig, find if it has } if le && t!peof self !== 'unreturn d')) {
        env =gainst it,
                //otherwise, assume it is a top-level re       on(requirejs)) {
    lit('/');

        exist   //otherwise, assume it is a top    //Some use of packa                    mapV = 1;

        /**
          * which act like paths, but can be remappej, prop) {
        retu// foo:    ,   v                             mapValue = getOwn(mapValue, nameSegment);
     re that w: true */
/*global window                    +f (name.indexOf('+                    if (mWeightlib/VARI? re_DECLARATION hasProp(obj, prop) &//      vs fo     ary = path.repl}

                    //Check for a star map match, butrn fn.apply(obj, arguments    }
        return targetFunction.prototype.bind, butE        };

     sed by jsliFunction.prototype.bind, but }
 N_NULL_AND_BOOLEAN_LITERALS/figure out w                    //'o ( (name.indexOf('-                //if                      elsef (foundMap) {
              'eJS Chara bo'                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is > 0; j  segment match later in a matching
                    //config, then favor over.    }

     s st[foo}

    if (typeof req/Used by jslib/rhiundStarMap = getOwn(starMap, nameSegment);
                        staN_IDENTIFIER_NAMES (/*String*/path, /*Strixists();
        }the 'this' object is specified
    //  if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                          foundStarMap = getOwn(starMap, nameSegment)Node) {
                    if (scriptNode.getAttribute('data-requiremodu        if (!foundMap && foundStarMap) { {
                    foundMap = foundS will
                // in a matching
 PROPERTY_ACCESSORn hasProp(obj, prop) && obj[prop];
    }
 over     }

      s star map.
               owser) {
                each(scripts(), function (scriptNode) {
                    if (s               ribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return tr         //retry
                pathCo  });
            }
        }

        function ha> 0; j     foundMap = foundStarMap;
             && obj[prop];
    }

 }
                   ode.getAttribute('data-requirecontext') === context.coning} normalized name  egments.
         * It wiode.getAttribute('dth, 'utsameSegment)) {
                                  //Check for a star map match, buarMap;
                    foundI = starI;
    sts = functif is     ;or
  rename.s              }
                }
js$/,
        currDirRegExp = /^\.\//,
        op = Objec  consshim: {},
                n ex& opera    returCi,
      += 1) {
                if (ary[ie.log('x.js exists not applicable in browser f the last part,
      ire = unenablelis return readData.val          if (!target[og('x.js exists not     };

    } else if (typeof Packages !== 'un   func     env = cwd() + */             fou[{
   ][1]).unshift                        } else if (typeof Pa                  leFunc) {
    /Usefore i>    uirejs, require, defineadFileFunc : null;

     over fileNa            defure, re          *
   arI = i;
    ig to the ypeo           throw new E'Ci,
'typeof self !== 'un call is 0]ction makeModuleMap( to , parentModuleMap, isNormaliz1ized, applyMap) {
      dified b  var url, pluginModule, suffix,ix, nj, prop) {
         exec =This is a bootster) {
                  parenean} applyMap: aonly be true if this map is for a d       i;
    /arellchProp(s function trimDots(arytring,
     arI = i;
    l(it          f isore ; to mix in <  funl, generate  elsj, prop) {
      );
        };
    }

    functio=== 'undefined')
                waitSeconll break outer) {
                === 'undefined'               x = name ? na         }uireCounter += 1);
            }

  s method       * Should only be true if this map is for ns it is a require call, generate an
            //internal name.
       //norm         commandOption = fi     cototal{
    arI = i;
        function make\nhttp://re  }
                  
        jfileNamis name.
             rn eval(striarI = i;
      );
        };
    }

    functiod')) {
     se;
                name = '_@r' + (requireCounter += 1);
  d')) {
              nameParts = splitP// Dinorm    .com/jrburke/r.js amongalizedName = '';

       arI = i;
    one for
  fileNs = assesundeogp ex,lete'. The UA  d            if (deepStringo wait for compl            }
    /get fancy though.
dy in play v            }
            return [p      ma segments.
         * I//     ] === '..')) {
   descende,
       irnction () {nestarI = i;
        );
            prefix = nameParts[0];sort( applyMap apply the    print.apply(undefined, arg         name = namef isOpera for reas  }
           );
            prefix = nameParts[0];
                waitSeconame's
                 //Normalized name ping that includes p       namePa       /       name = name.substring>e
         * thsubstrin//Normalized n// Takname.sne
   itozill    n,
          *
         in    cprefix);
         /Use'var'atch, update name toNormalizednect/args.js
       edo that part.
     -=a matching
          STATEMENT_AFFIX    //config, thenarts = splitPrefi  return vm.runInThisCo    nameParts = splitPrefix
   rmaliz  *
              prefix = namePame
         * th         isNormalized =CLOSUReadFileFunc : null;

    /**
         * Trims not need tgments.
         *e,
       him: {},
           
   ither fl(itUglifyJSarI = i;
               } else {
   le(xpcUtil.normalize(t.
                waitSecon  requireCounter = 1,
       for relative pathsRewriteMixin) {
    fileName exis && !!process.versions.nodex);
            s it is a require call, generate an
            //internal name.
       ts.interf -= 1) {
     ast_;
(fernfig, find if it ha              nor    funct                      g?*/encodithzed: !! via another AMD loader,
 .interfaces;

      n (/*String*/path, /*Stri true, n sloppy: true */
/*globa
                          pax = name ? namerts[0];
  parentModuleMap, isNormalized)e for
 R   * @ret
         * @param {Stringized.
         * Ta true val;

        fileName = ars.re2.1.e                     )uirejs !== 'un     * @param {Boolean} applyMap: a        paths if izedName);
         arI = i;
        d = deprotoenv .splice. to                      eturn ostring.c        for (i = name{
           var prefix,
 0pMap.id,
            [0];
 ,ill keep a leading patiginalName = name  func else if (typeo          normalizedNamzedName);
               ntext.Modulurns {Object}
             return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registrname,, [      .err      pre,     ,ch(a []      sProp(defined, id) e,
 opyme);
        };w/o ire)) {
name === 'defined') {
         name: norm&
   1l, generate >re call, generate -ap: parentModuleMap,
      return mod;
  for a  }

        function on(de       url: url,
        parent3(ary, func) {
               url: url,
           ean} applyMap: appl     fn(mod.error);Removame);
        };s out  if
                    mod.on(n   return mod;
        }

        function on(depMap, name, fn) {
            var id = de     {
            var id Toplit     //S   print.apply(undefined, arguments);
    malizedName);
                }
Reste relatiavailabiltPrefix false);

                    cvalues must
                    //a;

        leFunc) eturn ostring.c =         var i* This is a bootstra name of theorentModuleMap.nam[bIsGlobal) {
   3    errbarefix(name);
            ;
            nameonly be true        values =                         });

 .if (na:                r            entNkip a Dir.argve Prolog               /nAfteritems to his cont <                req.onEction makeModule'dtems to  suffix
            };
* defQueue.
         *zedName = nameP * defQueue.
         */ else if (typ);
        };
    }{
        //Normal       owser) {
           takeGlo    f* defQueue.
         *rror(err);
                }
          name: norm* defQueue.
         *           / generate a                req.onE      //on context.
  nternal name.
 d by jslib/rhino/ait) === '[object Function]';                        unnormalized: !!suffix,
   e,
 ion = 'yright (c) 2010-2012, The r
      mozilizedName = '';

          //n) {
  }
   dOption = flers = {
        ormathere is a b    }(ine, ermal            s)arI = i;
ginalName,
                isDefi.interfa.oSurvey'[object FuncpMap.id,
               prefix + '!' + normalizedName :
            // Esrateish  reqMain = rif (na]
  tions hollSet execher arI = i;
bIsWsingE  exec
                 if (mod.m       throw ns,
        //Used by jslib/WITHatch, update name tno/args.js
                 if (mod.exports) {
         EVAL           return mod.exports;
  fQueue.length) {
                /      return mod.eay splice in the va           if (mod.}

       exec  } elusin       arI = i;
   exec = function (st             sign the one
          pMap.id,
    lues since the context -/Set error on mfals. The map= new contextfunctionunine, e i;
    fileN         each(i          s it is a requir   } else {
                }
          }
         assign the one
                //on ction () {
        function on [defQueue.length - 1               ive = false;

    d to resolve rela);
        };
    }

    funct//Normalized/Uses,
        //Used by jslib/xpcon     rhinoArgs = a      return mod.exports;
  = {},
        //Use'undefDefQ suffienv ofD.
         * Should o it=ion () {
 ;ion (n;
      //XPCO //co       arI = i;
    rmalize method.
function (mocy.
    reqMimmedlicely foor newe items to this context's
          */is a requiode has a
                //local var       if (mod.module) {
                    tre. The map confi       mod.e       foundI = stafig.config, mod.tch,id + '/' + pkg.main) :
                             cfn  c || {};
        namees not already have a propert  });
                }
         //Se   }
        };

               void 0      Obrequir       nfig.config, mod.map.id);
                               }arI = i;
                   unnormalized: !!suffix,
       ginalName,
                isDefine: od.require  exec F       }pMap.id,
                   prefix + '!' + normalizedName :
                     mo            }(oAom/jrburentMxT pre       unnormalizadd_     egistry, depId);

  )      define, istry, depId);

  ;
};
/*jshint   n:(mod.    
/* Local     retus:malizatio/* mode: js                 / a rquir: utf-8nly if it has n    nt-tabs-      nilt has ntab-width: 2only if it has nEnd       d only if it has nvim: set ft=javascript fenc=matcheet ts=2 s      w=2:t has n:    ssed[depId]:noTabs=    :tabSize=2:             deep    nt          });
fig, m('u     js/parse-js& na"exp    "]       Cc =   mod.    /*                      } else {
                            breakCycle(eFunA JavaSepId])tokenizer /ed;
s     beauorg/int/ne. Kp ex    
  Tnamereturn F]
   arate.
    Node.js.  Wary)minimd, phd.map.(, name   mod. stuff)urn va/Rhinworkpe,
    JS    t
            }f     returnnse r.jsed);
        r.  Ict oth  modtOwnaced, proc
              [1]
   aced, proce       libr//Se    top in Common Lisp
     Marijn H 2.1beke.    ank youe to di!    [1] http://mto di.hble the wnl         /    E  mod      mod.em:eFunc)- modId, er(    ) --ompletellbadified b.  Corma requt is h.
      file to ino fet * in ee) { modId     .sta     waitInterval) < newn AST.' || arlue) {aced, proce         -cleCheck = true;

            / (Cnter bother if this call was a resu              return          uthor: Mihai BazuleMap] parent modu     retu<mChec.boade@gmail.com   prefix = name.substr Seconds o
         .net/blog              d onfiin = rBSD     nsentext.s
   rtchi 2010 (c)inCheckLoadern;
            }

          Baide ontInterval (econds of 0.
                expired)Calls =Ren normalize() {
     ill of the= '.bin//Serop(t,p
    orp
   ou      modif    if (p    p    te ofprovid: m, pro          e,
          oncat     metntext.sengths   //Skip thinp.id,
           .
   re exisod.evbog(2);
       c eachPropnoticle-inis//github.          == '.') {rn;
      }
        disclaim ret }
      !map.isDefine) {
 ind or in erro     reqproduced.push(mod);
                }

                if (!mod.error) {
                    //If the moduleProp(objdoce.js args[1]nd/orlse if materiame, applyMap)          i, j, nrn normalize(nalls =THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANYlls =EXPRESS OR IMPLIED WARRANTIES, INed' ING, BUT NOT LIMITED TO,    lls = {
                OF MERCHANTABILITY     FITN } eFOR A PARTICULARlls =PURPOSE     DISCLAIMED. IN NO EVENT SHALL      stillLoading = tB      L           NY DIRECT              CcriptAL, SPECI= trEXEMPLARYpMap.iOR CONSEQUiptNAL DAMAGES (           noLoads.push(modId)}
    ROCUR        rSUBSTITUTE GOOD elseSERVICES; LO} elF USE, DATA, O }
    ROFITS;    BUSI     INTERRUP   /) HOWEVER CAUSE    D ON         THEORY    ) {
t(mod, WHEthe mIN  ifTRA        Cs.puthough, koading.TORT            NEGLIGENCE    xpconWISE) ARIS thaI    / WAY OUlook/plugin         true;
       ,mod.i IF ADVI     a noE POSSIpt(modI//is waSUCHfix) {
back                      } else {
                            breakCycle(dll in  both[ Tsed);
   (ame =anlse?]   //D }
 , FiKEYWORDS = ansol_to_haegment if"break" reaso"caseit time extchit time eme =ror of unlotinuired, thrdebugger          faulded moduldelet          oit time     it time f
   ly + noLoado = makeErdified bit time if  err.con   err.con.
 * AvotextName newit time       it time swi error of uthro         trll, noLoaid + 'it time va = makeEr    it time      
        ith"
g ta noLoRE    ED_.length) {
                //com/jrbuit time nodeDef
        yd timeout kgNait time eir, timeout foub  if (needenum           mod}

       tend         ds, nting on lloa  //If stgotor moduleimp each(i something
    //If stinthan a plugierfac if (needlonge;
      a to it time packag
         rivad timeout urn ecte.
       public onError(h    //If stCi,
  if ((!expupr = makeErsynchro);
 .
                  //otes;
iegin resourvolat   iCheck) {
 ads.leng_BEFORE_     } IONth) {
                //return onError           'Load timeout      }

     s: ' + noLoaexpir Wait for it, but oATOMth) {
                //(mod.dy in effuls, and th    it time onfig, mo& !checkLoa);
 ATOR_CHARgth) {
           kgName = n("+-*&%=<>!?|~^"    ) {
   _HEX_NUMBe ma /^0x[0-9a-f]+$/i;   checkOCTded();
      [0-7     }, 50);
DECded();
     \d*\.?\d*(?:e[+-]oaded =\d\.?|kLoad)\d*)?    }             gth) {
                //= context.contextName;
     t expired, che           cle.
       'Load timeout ++it time --          this.shiit time !it time ~it time &it time |it time ^it time *it time /it time %it time >>it time << = [];
              = [];
           = = [];
  pluginMap= = {};
    pluginMap!is.depCountpluginMap?= {};
            xports th-xports th/xports th*xports th%pluginMapss = {};
  <.pluginMaps          t|xports th^xports th&    */
   this.depEx|& !checkLoaWHITESPACE      checkLoadedTimeoutId = 0;
    \u00a0\n\r\t\ftory0b\u2tions180ens) {0ns) {1ns) {2ns) {3ns) {4ns) {5ns) {6ns) {7ns) {8ns) {9ns) {ans) 2fns) 5f\u3     FEFF        chPUNConly
                //if a timeouttId = 0;
   [{(,.;:. Can happen if     checkLoadedTimeoutId = 0;
   []{}(),for the sameREGEXP_MODNode. checkLoadedTimeoutId = 0;
   gmsiy                 });

    expired && noLoUNICODE  fiing mUni     6.1lls =le UA :eNameRegExp("[\tory41-y = f5Ay = f6ctory;
7      A      B5back)       C0tory;
D6      8tory;
F//RegiFter fo2C1 this 6n thisDmoduleE      2E4    thC    thEy = 37      37is.on37//Reg377    } A);
    D    }8     }8ter fo38     38error38E      Amodul3A3      F{
   3F7tory;48modul48 (this52else 53ctory;55//Reg559            58
     D      5E     5Fp an erF2y = 62      64     66 errb66F     7ctory;6D3 = bin{
   6E functi//Reg6, errb6E  errbF (this6Ferror6F  err710('erro2tory;72t('err4D;
    A{
   7Bmodul7C (this7rback 7Fis.on7, but 7F     80      81{
   81 a cop2is.on828y, so4 of the5that
 Ar', e8A);
   8Aerror904tory;93/on t93vents95r', e95ter fo96modul9ack = b9 else 979m" deps  err985m" dep      98here d9
     9alread9Athat
9A (this9B
     B the 9B
     9Bd. ForBexamplC errb9Dand
  DexamplDFpMaps E  //"sF
     FmodulA0rectlyA0     A0  errAor', eA1alreadA that
A2 (thisA3s && d3 the A3d(thiA3{
   A3//RegA3ice(0)ed. FoA5ssed iA5errorA5 errbA7);
   A      AirectlyA8ventsA8 that A9      //doingAa direAt modifAcationAof theAB.errbaBalized
array
A      AD      E       modulB  this.B0errorB= depMBor', eBepMaps.B that
B;

    B      B    thBs.errbB3ve optied. FoB exampBicate B5iously  that B   //"B7ever,
8r coulirectlyB      B//If noB      B9);
   B9{
   B9en pre9epende9marked9 errbB9it thiAr coulAis.onBAter foBrrbackBAcies ararray
B      C  this.Con to C0/If noCor', eCr);
   C that
C;

    Cs.errbCd have Ced. FoC exampC      C//on tC6f (opt   //"CirectlyC      C//If noC      Cnown unCa direCt modifCgnore C optionCarray
C      CD errbC     /CCould C      Co the D  this.Don to D       Dor', eDr);
   D3     D exampD4 errbDmoduleD   //"Df (thisD here DirectlyD9//RegD9     de      DBalreadDBB         }
        DC//RegE0ctory;E      E    thEs.errbE       E4les, d errorE8for a 8is.onEe, setE8that
E      E      E9 modifE9 more 9ssed iE   //iEAfined c enablE });
 EA more rrbackEA     EA      EcationEof theEgnore E//BecaE       EC callecles, dDCnt -= D  errF0r', eF       F4else F4ssed iF6errorF{
     F     10y of t102    103  er105    },
5{
  105 (thi10 as e10   //106ction 6//Re106/If n107r', 107rectl10 erro108 err10A    },
Cction Celse10C      up an 10o a c10F     124that124) {
  24     2etch: f2     12     12() {
  2      26.startTthan 12listen12     129.startTcatio12B);
  12 {
  12Bter f12B;
   2C      C           }
2Che mana //Re12ster f13or', 13r);
  13 depe131       
    138this.f3     13       3     14efined16     166 that16 here168       led. 16       6rback16E) {
  6     17     },7on to17      171 retu7eps.
 173rue
        175rue
  

     7      7d) {
  7      7       7gnore17D     7 //wo18       8 else18       8a dir18rrbac18Befix ? , but19     },91     9etch: f96p = t9ck);
 19     19       9ed[i]19C      9      A     },A1     A       A5     A this1have op1/or co1B4   retu4     B8alrea1B//sou1BA;
   BAtext.BB  var Bion (1C     },C2n mapC      1C4text.C() {
  Cevent1CEssed 1C'erro1C            }1Cis.loaC erro1D     },DBtext.E     },Fgin toFload itF1tion F       F4ar dep4ndency. conteFetch: fF5     F//on 1F5     F      Fbled. 1Fction F       FB     FdepMap1FB     Fger isFlugin mF1;
  1F.
    1FC.load( this.fFnd(th1FD       D urlFe      1F      FF.id, urshim) FF       this.20     20 here20is.map20
    210 the210else210 (thi211d(th21 depe211ssed 21
    21ray, 212//Re21 that21;

   212        that21ed. F213     21     21prefix214(!this     21

    21than 2}
     2C2     C3rn;
   his m2C       Chis.o2CEB             o the2CF it.


     2D2     Ds
   2D      D      }D6map.id   er2D      2ion (i2D      2DAs.depExter f2Dhis.l2Dn() : 2DBs.depEthe ma2Dger i2use of 2ycles,2Desourc2D     2Dup an 2D //Re2Dster f2Dnable2E     30  this3    {
  2ctory302/on 30      30ck = 303ter f303erro3factory30on (i309     30   //30 {
   3etched3= true;30it('e31ed) {
       31.fetch(1n;
  31      31     31o pass31rror',4y of t4D {
  4   //Re9      A      }A4     A4up an A4FventA5y could6on toA61 call
 1  erA6
    A62    A6      A      A67 thatA6 (!thAs.map, A      A71ere aA7    //72);
  A7than A78r, cjA7n;
  A7is.mapA79d(thA7       7rrbacA7 on thA80moduA80alreaA80{
  A80    //8epMapA80     A82 theA       A87     88self a8gnoreA8* ChecA8Fle to8Fd res9 * defA9 = thA9      A9     A9

    A97     98 modiA of thA9C     //RegulAslice(AAining =A4sFuncA4   if A thisAA       A     AA  if AA      AAd();
AA     AA {
  AAthis.AABssed Ae;

  AAfor aAAC      DalreadAd affAA      AArbackAA     ifA     ABefinedAB0     B0      B0in thB1        depeABeps.
 ABeck: AB2of doiB     AB      ABEsFunc}
     D7 enabD7n() : D7cles,D7Cr, cjD7epCouFd();
  FA }));FAck);
 FAD/on FB            /Fle in eFB1    FB
    FB1 thatFabled Fode,
  FBrbackFB      FB   } FB3 errFB4r', FB4moduFB4d(thFB4is.oFB4
    FB     FBD#699).     }FDetch: FD     FDnown uFD     FDo passFDes in
E       E     FE7      Ethis.FF      FF     FFactoryFF
    FF6      (this.Fap.id, FF) ||
 F      FFion(fFFD     tr     FFD       DC]"ormalizcombining_mark    this.factory = 3y of th3   err4allPlu04e, set 9s modul//Beca5     05 modul5tead 051;
   5    }05     0       06ency a64r, cj065  errbar', e6
     06 //wou6t that 6his.on6E      Ethat
6E       Events true
07      07      7A
     7cation7rr, cj07     081
     81/on t81.execC8     082rectly8s
    82ssed i8     08   //In8  url08E modif8F      y of th90d(thi93 modifi   } 093/If no9     095im" dep     096f the 6p.isDeakeReq09      9t.loa09B       1;
         09C direcr fail09     09     09   //09E.errbaefined Aap.isDA      A             0AdepExpA     0A       A cont0Ais.sh0A      A      A7k = ers via 'A      Ais in Alay,
  A      ACere arACignore       A//favoAver reAurn va       0Bap.isDnError0B             0BdepExpB      B       B //favB      B  //IfBsettinB exporBt can Blay,
  B      B.
     B      B       B//favoB that Cefined Cap.isDC       Cf (cjsC      0C      C      0C //favCnctio0C      CsettinC exporCt can C      Cis in Clay,
  C1;
   C.
     C      C       C//favoC, funcC //RegCver reCurn vaD,
   0Dap.isDD       Df (cjsDalreadyD      Dorts vaD //favD  //IfDsettinD exporDt can D      DC      C that DD       //Reg       0D this.Dlse {
 (id, fE     0E3     if      E4ere arE      E      EB     ifarray
E      Eis in Eesourc0E//favoF1that
FepExpoFck = eF3epExpoed. FoFs set0F     0Fack = bFe callFerror)Fe, setF8      F (!thiF.depMatxt.loa0Fcles,102r, cj10s set105      0      05) {
   modul106the pl06);
  06ere a10 }));
0ack = 10      0      10ap = t0      0depExp109tion 35
     3     1rr);
  171);
  73l;
    3      5 the175      7     etrue;17      17    },7d aff180      80'definA     9       9ld re1defined193      n() : t9for a       19     1A     /1A1     A5   retthis m1ere is 1A     1Antext.their c1B0);
  B set t1      1B6      B = thiB       le.exp1B {
   1BA'defiBE      B     1C2      C     1C this.fCDteralCD   expo  } e1C     1C* CheckCshim) use of 1Dr) {
1D true;
Dit('e2  this.20 //wo20Could20E.enabl0     2CE     i     }2efineD2D      2export30;

   30is.init is c30led. A    erA67   if 6eventA6   //A      A6     A8,
   A8    //80If th82skip ths
   A88     8 erroA8      A81;
  A8ror. Ho8      92
    A9     A9d valuA9rr.reA } elseAmoduleA9      Aror((tAA      ArrbackAA     AA4       //faAA7If thecatioAA      AA     AAB     AB      ger iAA     AA moduAArr, cjAA      A, butAA erroABE      Bever,
B'erroAB     FB1        //ReFE= depFEeps.
 FE26 = context.nnector_pifieumod.e    this.factory = f     2      20use t20     F givenFE     FE      FE     FF3F = contexdigit    this.factory = f       0ed. Fo6

    066    //o pass 6F/on t7       7      9      09   err9      09      Alse;

 A   errA       
     0Blse;

 B   err       0B      Clse;

 C   errC       C      Dlse;

  depEx0Eetch: 0E//on tEup an eE    /0       0F   th10   })(t0ng) {1tself, 1      17*
     7Ethis.8      1depExp19      1      19 this.f9    /1er, fav1A8      is.map;A this.Betch: fB      Bn() : tendenc1C   })(tC      Cetch: fle thiAdeps.
 A6   thA8 anothe8    /Af (thisA90   id  anothe      AAetch: AAp = thBo passAB    tFF      FF19]") //b
file to iis_      (c        nIt is meturn;
.      .peof = m  //b          plu in t = makeModuch = ch.kgNaa boAt(0ue));
 It is mch    48 &&    <= 57      //Mark this u       as a dependency leMap(map.prefi in t              //Mark this alphanumeric_kgNa = makeModuleMap(mis as a depen|| pluginMap = m for cycles.
             t.execCb(id, f = makeModuleMap(map.prefit.execCb(id, f               //Mark this edMap, norished the define st                        nameished the define st               //Mark this 
        j_sta    .depMaps.push(plfor = "$"    tMap, {_                  var load, normalizre = contexbind(this, function (plugre = context.makeReq }
            edMap, normalizedMod,
    If current map is not nas a depeIf current map is not norame = this.map.parentMaIf current mtMap, {ns) {c"ng mzeroady.
  &&
-joiner <ZWNJ         /       if (thisdmap.unnormalized          J> //gemy ECMA-262 PDF        othlso his.            //Mark th     _js_    com {E       n/UseeckLoaded();
        na       name It is m     Infunctook nor(2), 16ue));
 leanRegugin.no          me, function (name) {
                           1), 8eturn normalize(name,          me, function (name) {
            F waiunctiturn no     //Mark thJS_P     Error(message, line,oces, pose?
     } is.        =              p con     =          ng map conco('./p =   normalizedMapo    efix  normalizedMastackf isOpe      )            need
         turn mod;
 to> 0; j -=

var requirejs, It is mp config agai+ " (    : " +           + " //fo           keModu"r app            '!' +")    "\n\n                    file to ijs_e                   //for applying map roweNameneed
                        //for appl      //Mark this modId(modId,up ma,                     reqCenv =n up maan b(vf('.=      || true
       ==           , FiEX_EOF  fi    //Mark thrtTime + w$TEXT    ng ma, Figth)readFile: e, noalizedMap.i: ormal.re     (/\r\n?|[\nre in/Do n29]/g,    ")          ^y done/, ''ormalize foefixalizedMap.id);    mod = gtokk this as a dndency for th     s as a dependency for this              ndency for thp =             //can be traced              ndency for thnew    _ the re : (mod.pMap.id,
 regex_ or nedMap); if (this.evento or Nts        : [}

   emit('er          eekquir        S.ipts kgNaAt(S (va);on('error', bind(te) {(be aal_eof, in              name , Fifor trr) {
             ++//Normalize/Useis.emit('ean b!            ; }, null,  }));                  if (n"       name = naS.                                  || !or', err)  }
          ++S       }
          Sap = ma//get fancy        foundI = star    co
                 modp.parentMturn no('error', bind(teofquirejs, requIt is m!S.his, fction () { return valueete'(    , is.emit('e;
              efix +rr) {
    env =                                    }
  efix = -1)          normalizedMod        osction () { return valuet.mak              name S.ed for c                  rror p = ma               rror         this.inited = true;
                     uetursnormlobal readFile: S.s.error) {
   = (emp uap, {    ator"}
   HOP(UNARY_POSTFIXnnormal)    Function.prototype.bind, but          keyword theywillit, but only
             olved otherwise now.
                        eachPe deistry, fuen if there
          olved oth    load.er, Firet of              env =    mp un }
                 :normali }
                 :error = er                            /for }
          k this        pon (depMap, i) {endefix               //Allonlb

                                 load.error !ed modules for this more, defame        normalrr.req load.
                  load = load.
         [               //     

  vailabl
         has )) {
  load..
     at i           break;
  uri:, Fiibind, lequire' the load.
      p.apply( i <.nam; i++j, prop) {
        re' t wit,
     wit||
                   [i]      }
                 mod       mod     }

           (mod.                 rets.inited = true;
       kip_whitrt']('       this.e      /wille = {
          ,this, f)
     * but on   th          enabled: true
read    le(probj, prop) {
 eanRegistr"    or this, f,e = ma   load.er      /cloba    d(ch,p = m       name = naegis+pletl
             onErut discard            this.init([], fassing the text, to reinfo      it([],erts !== 'undef.init([],err                                   loa                //suppnumld sfixyle of passing mhas_s of 2.1., a def                 exiin the text    =       ap, {."        cleanRnum     upport oldified byuleNa)              .enable();
x            X                 h a uniqtext,) var file2.1.0, support * Cycles over text, th    ve = useInteractive;

         //text,     tMap, {E            e" if (foundMap) {
            e        }

                        //Prime       //calls system by creating a module instancetMap, {-tive = false;
             //call|| (ition0}
   for any        }system by creating    var file
                            } e           +"        }  //cal  }
            //calls in th  }
                     .tive = false;
            for
    
   for
     atch e
     * but only i       //Prime back o        config.config[moduleName] = config.config[id];
       tion (plug, 'defined', bind(thi               load.error for any resource. Sti     n at th+            cleanRvali                      na             //coNaN    iis' object is specgnore: true
("   }
       id +
             foundI = startAlt;
      "In      ke/req               e,
                        //suppescaped      or', err);
                   l ref    rror', err);   load.er(err);           name = expi "n" :        
              /lugin
r             r         //resourcet             t         //resourceb             b         //resourcev             optio         //resourcef             f         //resource0             0         //resourcex           gth; i     }

     (hex_eakCs(2              lugin
uof that module to the value for this
    4                   /\n"                   //reror('ti    t([], function                    useInter this
    requirejs.org                      uri:;     0; --requirejs.org/doc, Fi in t                         return n                   in ter resource. St                if (hasInhex-kgName =  pthen (pl    (typ"//Normalized na   ' funct << 4) |string            this.init([], f+ e,
                    //suppnormali null, {
          e,
  eof       iU
                fi       i"       Cc ={
             , Fiqu           )    uleNam  }
                ;j, prop) {
        r}

               n hasProp(obj, prop.enable();
 \tive = false;
                   OctalE = trSmandOpti(XXX: djoin stodtrue"= plct     "                      //Secons://githubthis/mishoo/        /is/Rem/178     //Set flag menti, Fiot th_name,
0     = r              var prefix,
            if (hasInteractiv{
             .enabled = true;

 >=     n be trac"7         //Set flag menti                  e each dependency
                     fou thi  //with the depCount                    ++vertent l                   var id, mods(name);

              //Allowalize(na      /Ena3     vertent lo<= 2        }
                    if (typeof depMap ==        //Depen    4 needs to be conve1ted to a depMap
                        //and = 'string') {
                  }

                                            removeScriertent loelati      le to the value forth no patuleN8on(requirejs)) {
    ired up still beine = true;
   mod, traced, process                             /tMap, e: fu) If wa  }
              s.depMaps[i] = 
              normalizedMod * Cycles oerna
                                       [id]ad(map. {
   id +
                             //supp      true *);
          l ref.
         Name = m     
     {
     load.error id))  (er favor of the inte       })                load.er                 }).apply(defQueue,      }

                               mali to lo i//Normalized nad', bindi            this.init([], f   [id] true *1  this
        };

                //suppmulti                   return;
                    this.pluginMaps[pluginMap.id]     if (t: true *          },

            enabl      }

 */"
                    e, nome         this.defineDep(i, depExports);
          + 2 depExports);
        =ripts     t
                config: functi     }

                        return;   });

     
     >iabletextAlt) {
     fined callbacks
                //for depe#or de/100                 /^@cc_on/i      e, n if (foundMap) {
    warn("WARNING:  ap.errb          n hasProp(obj, prop, id) *** For u \unlo      d, pr load\"          i                      contex             Aengtd &&COM    Swait is meanservar          }

  stile     kng direlyn.loIe, onetwaitlorer..name, localRequ} it is alreadyhis.check();
        2   }ex          }));orts[i] = handler(this);
          = /);
          , Fibackslasor t       hat incame bu, e = tru then turn                   /s[i]  once pe !      pCount += 1;

                
                       

          {
                 if       l ref.
                             true
              )& !modrnal ref.
                      

                            } e      foundI = starI;
        != //r)             iExp.argng        e module is ena-- uXXXX.name, localRequunt still beine = true;
      this.enabled = true;/con
            on: func            i       }kgNa      his plugin, so iizedMi, loa       iole.log('See              cbs.pution (na
                            if (mod ve = useInteractive;

            /Use, function (&& !mo    .enablinpCount += 1;

  h  exi = /\ plugin, so iap.parent(16ce tUpperCasonfig, find if it !mod.en\\u{
   0000"        hex;
       +    /+the lis    (eout checks.  }));

                                   //supps.errp(      ;
                this.pluginMaps[pluginMap.id] regularMixin) {
            },

            enablprev_         if (mod &&uleNan_      of 2.1.0, supportcontext.enable(plh that act))               if (makeModuleMap(moduleNa     (na    ame],  }
                        if (!hasProp= this.events[n    handler = get[tive = false;
        d, args[0]        config.config[mo[2]);
           if (hand    handler = get]     detachEv            //Favor detachEvent

                           //issue, see attachEvent/addEventListe/ they mment elsewhere
             cbs = this.events[n    handler = getO          //Set flag m          if (!hasystem by creating           if (!cbs) {
  de.detachEvent && !isOpera)            enablmods[0]pluginMap.i  }
          his.check();
 de.det", [achEven,      g targeted
 [i] = handler(this);
          //since for any define
   file to igrow(o
        };

it: functuginMap,define, p  }
               ierr     p +       if (textAl error handlction (ma,hen rem if (foundMap) {
    me, cb) {
              It is m scri* @paraieName) {
                    node.detachrom it,
         * anctive;

                   o   [id] //since ,  */
 n at th||    * @        rentName here sincandle_            return;
                  le,
            dule,
         ark this as a depeuginMap,cy for the plugin
/"         var i(this, function ({
                       , depExports);
  le,
             still makes sense.
   

          ) {
                        /*et || evt.srcElement;

            //Remove    if (this.errbac once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatec  this.init([], f         removeL?   }
        "")        /**
     "/.name, lers will be supported, bdoback) {
                            ois as a donce pe }
                  IE exec }
          :efox 2.0ormal,.exec                      //suppoord.id);
           any      } else {
                  andler was triany he global queue,   [id])ame"e (defQueue.length) :y, fu.
         (defQueue.length) {
       's sake. No  args = defQueue.shift(dedTimeoutId)          if (args[0] === nulato;
    args = defQueue.sh   [id]rop(regis defintion intakeDefines() {
his.pluginMaps[luginMaps //fbal readFile: tryCount += 1;

     arento    on (depExporow er(eny define
   h a uniq  ex==    nor            ealuginMaps function getSc      null,                           useInter'load', 'onforce       ode = evt.cu   //xt = {
    , this);
               node.  }
        ext = {
     ark this asce
             ark this as                                     if (textAlfunctndenor Firefox 2.0xpir      e,
      is as a depefQueue: d intake t      e,
      tMap, '"'   //Normal'     }

  inMap, this);   load.error ') === 0)called ,
            takeGlobalQu/all olmalizedMod.enable();
xec(   //Prim          malizedMod.enable();
/ the context.
   ut this            onErro              ,

              }

              * @param {Object          re = context.makeReqconfigure: funany re   load.er          each(eeventedpkgName =  '      
   'e();

          'load', 'op.nae, nomen: true, nc        config: 
   gth)ncly processed.
   Stion intakeDeftLoad, 'load', 'o;
               d
             if (expired && noLo never REFIXth) {
                //t expired, checthis.map = map;
         im = getOwnn(config..id);
            m = getOwn(Check) {
  never be resth) {
            additi     , fal     ASSIGNep lo= asInteracta        {
           /modua;
            name ret[a[i] wha tru        0,                ntegrate.
  ++dy be no                })      [his.fry
         is.dep = [],        this.eed, thisched
            (ary, f{.exp: if (    //If0
Can happeRECEDugin                   {
     oduleName = map.quir1  modu        ; ++i, ++gin's name is not
    trule,
           , Fijliabl j < b           jpCount += 1;

     [b[jue,
                     };

                each }
      [odul(ary, func)[
    else {
      } else {
     ^} else {
                          this.ount =
      else {
     <     
               = cot.contextName else {
     tche   thipMatch else {
     +p(cfg              * funcalue,"}

   ]) {
   }  if (pro         S     _LABELgth) {
            oads);
t for        ifor(err);
       objsTOMIC    RT_TOKE    //if a timeout  onymous ]));
           tEventListe            

               expired && file to i       p });
  }
,ined,
,ow pode = evp conhat incstrname,
        r    ue
  ormalizedMagetO=ow p                  v    this.map.parentMap);
                    onventsintakext = textAlt;normal,maligent_    , !== dd', 'olsewhMod = getOwn(registry, inpumalizedMap      of;
    ap, {ad(map. {
         normal
      d);
    ncy for this enntext.makeSr') {     if (crev defQueue.shue;
           eek      });
                in_file to iap);

         in_         gins                /loop, so it
             abelthis as aizedMod.on('error     ame,
l ref.
 error', bind(tisemp unnormal null, {
                     each(                }));

               his, function (err    conig, ring' ? { and = co* Se                     th for this modu     d = d                  ring' ?                   each(cfgring' ?  depExports);
   pkgObj }      //with t                node.rand new obj pkgObj&& node.getAttributen ag//Adjust pac in ag//Adjust pac              //be passe         );
           eGlobalQue;m now.
    rly processed.
   cation;

       pkgObj = typeofrev);
                tpkgObj                       croak(msg       //for applying malFetched:t exin againngth - 1, and config.init([], sgpMap.id,
          od.en this); ? are n:                       onE  onErrorormalized,p =                                });
ormalized,lugins        interactive script matchintion;
      n;

   ms);
          cation: loctrue
      /rl.lengtray spli() { return value           use a        config: each(cf      contextName: cnd new objtion;

        tions: some use a m {
         tion;       e for all zedMa                ue) {]));
                } e                             i   Module: };
       pCount += 1;

     ad, 'loa, and config.pkgs is ttions: some ion;

   gExp, '')
       nabled)              xpor            yp    }));

               pkgs;
(e de if ((value             GlobalQuere a
                  can_insert_semicolrequirejs, requ        ortsFn) {
                 //state for       .
  ,
   figs.
          }             pkgs[ed = true;
         //update the maps f  });

            )    * @returns {O        /!              //update)            ]));
                } eas);
                t.
    uire.js nteractive script matchinKeepnthesis    de = evt.cu//If th"(           M, Fi  exit up execuf module alre
      fixRegExpre, define,              //late to mod        alue = {
                and ignore t          of             v ?         th            value = {
                mod.map = makeMmaybe_                  ts !== 'undefine()             var file
var requirejs, require,    xe
                              Sync       r.apply(p conabllized ones
            stzed,=ModuleMap(id || cf = {
        na
                node.as            module already                deps() { ret       
      =              //reququire is defined as a{
      's sake. Not} cf         function fn=t.
               urrentPackages can
       //be passed in again,    conf      | '';
   )plugiconfiachEven& node.getAttributes a depe    config.pode = evt.currentTarad(map.         var ird strmoveormed
          = {
     ng
  xt.m
     {
              /UseetGl&&on gefix, napackage conf/Prob           ," //reference the pacfg.deps ("         "s));
    originalName = nam         a            plugin
 um(value.exportsource
entLisequire(deps, callb //since equire(deps, callbnymou         var i ignore            }
            function loc    od;

                         iscard
 GlobalQue: immediate calls to?g.packeap,    }
       1        ret =              //reference the pa:     if (options.enableBuildCallback &ormal         var i          }
                     (deps, callb{          if (i options) {
   block",      _ context.require(s, callb[     //Invalid calugin
(     //Invalid call
                  }
                re', 'Inva;     //Invalid call   * @returns {Object}
                       }
          ror('ti         var inStrtoo
              .pluginMaps, bind(thilugin
rop(regi         if (isFunctioue;
                    } if (foundMap) {
         f wai         var inStr with m     nstet(       nableBuildCall          es.
         if (relMap && hasProp(handlers, des.
     {
                          err =         var inStry, function|exports|module are requested    err =                   }

   oturn handlers[deps](registction (valbody       this.enabling = iting to execurgs.length      i,
                     . If requirechPrue;
  //since they ,nchronous ), prefe  }
              })    
   (Build = t     ined.
              ds);    if (relMap && hasPropfor_enableBuildCallrmalize mod         name, if it contains . orified b_this.ski       //Normalize moifkeModuleMap(deps, relMap, if.
                        return          var inStr                }
)) {                      cation"' with 'ds, funct];
                            e requestedreturn onErro                      .
                      en loaded yet for ? th tha)ror')                       ig.shim               //updates not been loaded yet for coneoutFunction.prototype.bind, bu:ontext,t up execu, localRequi                        (err);
    if (relMap && hasProp
   (err);
  //since they ar,isFunct_          r       //Normalize mo     }) {
                    load,
   nError(makeError('notloaded',Illegal   /*jsl  try  ' nullseUrl.cha                            }
require([])')));
                        }
                  if (relMap && hasProptry.
                        ck f    if (relMap && hasPropue;
  var_, localRequi
                         stthe
                        //re     re call, collect them.
                  i       return defined[id];
  p(cfg.sh         }

      }

                        //Normalize moCycleleMap(null, relMap));

       ycle           }

          }
    lect them.
                  //value for them from the special handlers               ages, function (pequireJsBuild = tr.pack for this modu.packa{
                     if          //confs));
         }
              ine() ince their inf                 if (cfg.sh   opti0]the global queu                e
                enaoperly processed.
   
   .pack",ck, er      specified, then call
       if (options.en the maps for them;
   taitirequire([])')));
               od.on('error', bind(t(handlers,                                   has init called, since it is               hat incakeR& cal) ?     conf            && node.getAttribute     at i this);
               l ref.
             has im!== '         .packa //reference the paoaded',Lpackve) {
ion ( "        modIchs[na
    o                            requi        /     
    rn onError(makeErrcation             i   if i;
moduleNaerr);
fined: definhronous access to on          };
   ggere         enabled: true
  ..
 e transient.
                    if enabckages can
      functio                              as, an    req.get) {
ck f        callback.__rtext: ' +quiroduleMa              if (t.inited &&       mod, traced, proces          function fint.
                       m a    },

 ck fr commitionizedName =1nError(makeError('notloaded',Onlyorm =him: {},
            r) {
   i     ..in[0],
                               inNameP                    requireMod.e: contextNam
    _fo      return                 //sePlusExt,
     e transient.
      ;             if peof elativ                  ex > 1)) {
   !mod.map.unnormaliz.id, true), ext, stepe);
           )        },

                    defined: fed) {
              
             
   s    tepre if map config shouldt === '..';

                   r       * *Requilh     mePlusExt.length?ue).i                 }
:, fal

        ;
                  ob    Prop(defined, makeModuleMap(id, relMap, false, true).id);-           lhs,n ha  },

                    specified, Filalse, trMap);
      or',                * *Requires*                orks while module is being like nameToUrl.
uleName calls
      mggereurn localRequire;
      !mod.map.unnormaliz             se, true). {
          ?Erroru                err.c           });
   pMap.id,
           //                             ction (val     , a       this.enabling = tr      /             )t.
                               eah(this.        ame] =      normaliz,                       rnot the
             s too
               another AMD loader,
  {
    n(callback)) {                 delete urlFme, cb) {
              & isArray(pathConfig) && pa                          //Hold se, true                 //H})       []ormalize for that.
  //e);
       var map = makeModuleMap       this.enabling = tr              }                 //Hold           bal(va                     //Hold he internal transf        config.config[id] = mod.e       t 'this' will be.
    efore reg =                          }

   --     if (mod.events.defined) {
                            undefEvents[id] =   //module will be attempted told browsers will be suppo     
                  /           }

     pref              , acka* the use of a ative path.
   s: ' ot support using
  ref.
              enab                   check  this.init([], f
   ntexstill      ng enabtension into an URL path.       e transient.
      {             if );
 t, textAlt)                mod =} parent module,
  second a,
   ;
                        dets[id];               //Hold on to list                      oule wil      },

               ) {
urry  }

            },

         ct.
             */
           ,   }ckages can
      unction (depMap) {
                var mod = getOwn(registry, depMap.id);
      second arg, parent,expiram {Event} evt
         * @returns {Object}
 ment at, textAlt) {
             [rop(defined, onment    errback(err);
  * Intern:rop(this.pluginMap               handleative path.
   ror('timam {Event} evt
         * @returns {Object}
 te.
             */
         * @param {String} moduleName the nar') {
le to potentially co       completeLoadtext);
                cur;
                        deletecur         if (mod) {
        teractive;

              getModule(depMap).enable();
 ages, function (pnes cod);
                   to keep, bow er, bds, nullement. A second arg, parent,ow errparent module,
             * is passlls to this context,
urlFetched[map.url];                var ext,);

 pkgs;
                    if (!relM * plain URLsce
            ule and bound it
          ed) {
       passeow erparaakeGloe to keep  = {};
                  ative path.
   ds, nullparent module,
             * is passeds, nul;
                                 !                 }    segment = moduleN"Misse,
   ind/     } e to ksis context,
                     * tuleName;
            specified: functiovardefs(no_igin's name is not       enable: fedRegistry[this.map.id]o this name, then this is some otny waiting define() ca        //waiting for its completeLoad to fire.
                        function f  var ret;
        ase the
                    },
       Ext) .inited && (mod && llGetM    shExports = s          if (!cbs) {
          if (!     shExports = shim.exports;
e
               function (relMap, opt

                 fire.
          method is override       }

                _callGetModule(argsoverriden bck fo        callGet      specified: functio          /**
                nloaded        c {
                      new                  new    Prop(d_nymosProp()     is.initid) {
              (          found = true;
              ame, call fo/git    if (found) od && !mod.inited) {
       t, textAlt)   this.init([], fasheepId]{
  (
      defineeName,)         }));

       if (! for '  makeShimExports: function (val or n_ to lsewhere
              function f    parent module,
             * is pass with mod    reak;
                      ormal       //dots frosFunction(callback)) {
                      lid require call'),    * @returns {Object}
              } elsequire([])')));
    },

normald = get,0, ind        return onError(makeError('requireargs',  },

            /**
             * Convert {
   = mos cases where
             * modul      //Invalid call},

            /**
             * Convert via tes not** call normalize on the        completny waiting define() ca                    }
                                 callGetModule([moduleName,       } elsfalse, tru moduleNa cases where
        at the error handle, id) {
                        defined as a
       call de    config.pkpackack, er       callback.__r    idntListe * plain URLs     ocol is used a1]isRelative || index as   }
         it is just
   nction (moduleName, ext, skipExt)ue;
  nymos being   var paths, pkgs, pkg, pkgPath, too
               ages, function (p              ;
    var ptraif (g     a
       defin                                     enable: function (depMap) {
ule id.             var mod            delete defined[id];
                     (conf              //Ther com              if (re

                 {
              ,"ed, rlash is important for p) {
             rmalize ttion () {
 moduleName) && mod && !mod.inited) {
           und && !hasProp(context.require( args = defQueue.shift();
                    if (a     //late to mo**does    return;
           else  = pkg        ]",m, since their             specified: functioed. This rtant for protocol-less URLs as well as full paths.
                            var mod (moduleName)) {
                    //Just a plain path,, since their inf                 }
                  or ne: h     is);
unction getGlobal(

                 xt,                 //I                  //waitias_g directelse {
              pkgOb                   (!rel= "getnfigs         setf it i             or t!mod.inited) {
             asinMap.i       Cc                  if (config.enfo          if (!cbs) {
              shim = getOwn(con        if (!found && !hasProp(, moduleName) && mo
                    getModule(depMap).enab    via t"relM            //late to mod         for (i                      }
                    return rcalRequire(deps, callbet || (value.exports          //rehile module is beingwhen this method is overridenelse {
      hoices,
                   //Choose the one that is desired
                   callback && isF                 var id, map, req                 //tp, requireMod;

                                    parentPath = parreMod.skipMap = optionsublic one. Use toUrl for theser: isBrowser,

      } elsthat   var paths,  (mod, id) {
              .          nameToUrl: function (moduleName, ext, skipExt)eq.get are                      //or ends with .js, then ass{
              [                                pkgPath = pkg.location + '/'subpkg.main;s a module name to a file path. S]")                     } else {
           var paths,e if there is a                     null,
                          } else {
 to pkg.main;                    //A scri      this.init([], fthatpecified, then call
         ur in                      //the call for it.
ed, rwill never  sinc it starts with           //Done with m     ');
  "');
 -for an                                                     parentpMap.id,
            
          oin('/');
              tPath = parentPath[0]        call for ' + var paths, pkgs, pkg,ue,
    t || (/\?/.test(url) || skipbe resoln(callback)) {
= sy            efined as a
         = (url.charAt(0) ==ost'/' |                                          if (hasPathFallback(modulvanameToUed, then call
     (url.chartag,     that (moduleName ===(           ||es t         = syms_n't
  her      th
                     (hasIn    of     s the" | (/\?/.teative = segment === 'er.
             }

                //Ir_op(left,roce_    defined,       * *Requi     === -1 ? '?' :    * plain URLs like nameToUrl.
/Usedpneeds      in
    fined,      ke nameToUrl.
.
     coves tormalized,p === 'map[op]es in the built
       *
 ormalizethat mc >         arent module,
             * is pass     hPropcall foop(oin('/');
  t actua        * so}

                  ate func     or in".
    tion
 urn c)
             * so            this.init([], ftion. Broken out as a separate fun callGetModule(args  /**
         ly(exports, args);
onfiheck statused, then call
         (depMap, thcallGetModule(args);
 ate allback.ap callGetlement. A second a  function f?          nameToUrl: function (moduleN, Fiyransf           if (pand bound it
                   */
     r(makeError('npMap, thpkg.main;yrts)und && !hasProp(defined, if baseUrl is needed.
                    url = syms.jreq.load(context, i         //the , since their                 configs a depeate [0]+
   cy for the plugin
 + p       if (isArray(ub           //Reset     if (pkg) {
       th paPath)) {
            system by creatiback && callback && isFunction(clemen1]     p co          efor the main module.
        n't
  callGetModule(args);
 tion makeShim   */
                 iting for its completeLoad= (ext || (/\?/.test(url) s = {
                    //Doneodule: .load(contetionam {Event} evt
         * @returns {Object}
         //A  be a",js = {
    [val]for scrie name of the modul      * internal API, not a p       },

    
     usExt.lastIndexOf('.'),
              *
           d: funct
        keShimExports: function (valor its    * solely to all   br        context co     segment = moror('                 d: functione name of the modulleMap: makeModu]));
  if there is a func
                    }

                       eqarts together) {
          and still makes sense.
                if (eages, function (pk}

    //args are id, deps, factory. Shou                 undefEveld be normalized by the
      } e                               undefor the main m            oplev     mulate
    {
                     tOwn(rp.id);
                if (mod) {
                  if (ar([         }

        U if tdeRe) {
                  },

    });
 h;

        unnormalized o,true
    when require is defo help Ca loaded.
       ed',ncat( unnormalized onj;
     {
           ' : c    me = plugin       });

    functioo fetch. A
     re         oduleName = makCyth) {or for: ' + da  //c      ++io fetch. Ajs = func[i]m.deps |
            value.init)  {
           a.
     *
   egistrycallbacoduleName = map) {
              tion/local sc: true,
 system by  //Find the right context unnorm = {
                    return mod;
       }

  all.
   ) {
 it
right contexttId = 0;
  st                   special  Exeright contextNamePlusExt) else ve a shooduleName = melse tion (deps,ible ifo fetch. Apt errray[i },

          //Bind a              //tmoduleName] = right contextwill     g dig object
      Utils.jurn mod;
 sts();
        }

  ;
                  , idMap);
            }

        aitIntse dependenci   mod.      ;
   =          ; config.c     ire.js i contextNaof deMake a l contextNa  },
     },
 contextNaNamePlin ei  co contextNa {
          th) {
           contextNap === 'map') p === 'map contextNadedTimeoutId) {
dedTimeoutId) contextNa               ea              .newContext(contex);
         contextNae, id) {
            e, id) {
          contextNaction (map) ction (ma contextNa 'fromText eval for  builfromText eval for Support require = context.makke it re = context.makte with other
     * AMDo make it */
    req.confontext;
   et_lo removequire is turn rve a sho [];
  turn r callb// the re    retus:ometjs-       as an: 4ometif ([depd]);
            squeeze-more     r) {
rg.shi   mod.c, "modufg.shi.          than other envs
 check(); //pa that h       if, funu'modu     jse ca that h(an setTimeoul;
    pr       req.nextT) {
  ypeof se      }
jsp      if necntextName {
 );
   context = getO {
 nctioif necMAP' faio.MAP reason === 'map')  {
 ort requir       tion (map)  {
 *
     * Suht context,st_other e_vs
 
   .
     *
   w  /**
 alized: !!su, ;
(f = wl;
(f,      config,     } else {ly fors  //args are id, d{
   av  }

s =                if (na= ,
         
     ormalized by thejsExtRegEav.0, support just passing the t event from a_lUtilsf (isArragsre);
  he event from the [          exts,
      d to filter    o tranto a fil         * ;
(f)  break;
{
           thme,
          readFile: ted as an              newContext: ne: newContext
    };

 d to filter          req({});

    //Exports some cont       //If the map = makexts: con //Referencfix fontexts instead of eaa scr(config);
ed t       
                }
ed t   },

            if (!cbs) {
       est 1 },

 onsol     m      hans ts cons' object is specified
  pt erro: ' + dat!     function onError(er    'undef',
   A module   * M                  fi    [moduleName]));
             deps = cal;
(fu[ held otene relMap,its confconfn ctx                }
     x = name ? name.inwill be
       //with iUtils.nfig gets used.
 s in pl req[prop] = function () {
  !          vx = contexts[defContextName];
        there are[]tx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        hs in pla.head = document.getElementsByTagName('head')[0];
        //IIf BASE tag iis.fac         //with i functioaseElement.parent            ets used.
ement.ps' object is specified
  ;

    if (isBrowser) {
        ement.pa.head =document.getElements       complet            //Referenceld onck(); //pass  that during builds, the lalement)      + pd, reScript    req.                     va==       node for the    ad =[0arentOwn(or = def2 },

  k normall) {
d in browser envs.is a problem for IE6.
;
        owser) {
  + pkg.mai= con"of dechec Inte= config.config[id];
            */
    req.onError = defbrowserp.parent  /**
     * Createsgments.
         * It      e this bro)  ==>k)) o+"s in the URL, it icreateEleaultOnError;

   l when re= defau                         [  * callbac }
  = defau) {
 cture
    " ]l ?
                document.createElementNS(e of the default context
    eScript th its config           var ctfig gets used.
        req[prop] = function () ;
            return ctx.require[prop].appx = name ? name.in for the browsers in play, u          vay, using appendChild is a problem for IE6.
    moved. Details in this jQuery bug:
       {Object} context the require cont9/xhtml', 'gets used.
 9/xhtmlleName the name of the module.
    -8';
        n commannc = true;
        return node;
 it if you want custom error h    sp         },

                th
(fue = req;//Only fore) {r meant to righ   if (!c
    if (!requi         if (!requi something after the current tick
     * of the event loId]);
             ) {
      * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.                       } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
        ng
        someoadinsetAttr        ey      funtotypbuil   wbned;
     back aitInterval && (context.sta           = r.
  ter +=                    retu/          
        ext evil:AST.      stillLoadiCalls = [          nre) {
--ndefloyzillrioust-is-mizan be sto      , nameSegmds, n gend = m
    '2.1ell mallingPaRTUNATELY Opera implemegen_    -event-is-not-fireion modeson c     ileUtils.//UNFOPas       v     (name.paths =, loction ( is aleNaexec-is-not-fasmap['*'      cuire.js tto get bacetty"eNamep(i       needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                  //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
 
     */
    req.nextTick = typeof senction (fn) { fn(); };
ion (fn) {
        setTimeout(fn, 4);
    } : fu= function (configes not = function (config * Export require as a global, but only if it does not already exis          helpe   bbjs Te: http://g) {
                alized: !!sullback))  context       c    wContext: newContext
    };

 MAPild e       Cc =def

            enabl     eMod    ;
        node.turn ef                     moduleNaa//witpt tag (wh = options || {};

     ule will be}some context-sen//of the a to k    if (moexecution, soow thuderst
    };
h is stored      ngScript         contextName: cou {
    us d        hexports slback can
     * oueq.s = {
     ps = [     stry(mod.map.y(parentP    unnormafig objecttext: newContext
    };

                 default contalRe!== '/') {
 name = pltext: newContext
    };

  umurn node;
        } else  call!== '/') {
 {
                wContext
    };

    /urn node;
        } else
    each([
        ingScript = node;
    , so to tie an anonymous d
            } elurn node;
        } else      :entlyAd //Referenc                     //arece th appendChandling.
         a build has been don     (config);
t, c,     });
     ally {
                    if    };

 }
              us dtxports           //reevalecCb: func? [ conymous dcasyncaluated
                                 * @us dfportScri            complet use of importScripts, i the gparam {Error}           //Done with m       'defi
(fu      rn node;
        } else ext,
        //so that during builds, the) {
                coemen)mous dreate dluated. However, if web work        param {Error} er'toUrl',
        'undef',
        'defi  contextmous d    * 
        'ran         this.enabline) {
     [moduElem?
          }
  s module;
                }

               }
importScrip reworked.
    ted. However, if web worke      (config);
                 ch (e) {
                  .onError(makeError('impo      retue') {
            return interactiveScript;
        }

        eachReverse(scripteasy enou,
        //                            'importScripts failedond
    re(oads      t.onError(makeError('impo
                   forormalizrck)) {
              e) {
             main      scripurn inteattributrn node;
        } else     leName);
            } catch (e) {
                context.o * on a require that araria status of landling.
     * @param {Error} err the error object.
               e,
                                                   e from contipts. This is,
        newContext: ne: newContext
    };

    //Creaty.
                                                        equire is defined as a
   e) {
           ute to set main script fory bind            head = script.parentNode;
            }

            //Look for a data-main attribute to set main script fid =turn (interactMap, thiveScript = script);
            }
        });
  Map, th      return interactiveScript;
    }

    dule level requir    ractiv       to k       } catch (e) {
                co          });
        re     one.
  inal ba         mainScript = data    ain;

     vvar, keye texame;nal baseUrl if there is not already an explecto one.
  key one.
  ata- (!cfg.baseUrl) {
                    keModulturn (interactivin for use as the
                    //base;
        reaseUrl) {
                    //av  mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

   ed, id))leName);
            } catch (e) {
                context.onError(makeError('impo* callbfor a data-main  script loate, which could also adjust the baseUrl.
  
   isBrowseExp, 'rn node;
        } elset(0) === '/' for a data-main           } catch (e) {
             aseUrl.
 ntext.onError(makeError('impo
            /(req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
           interparam {Error} er                                        e,
                  mainScriptrn node;
        } elsethere a? cfg.deps.g di we can append children by
        us duncti           pleName]));
            }
 p  * Creates2require[prop].apply(c    p  e,
     phis  }

    if (typeof req    rst argument,
   , pw3.o]plugiget/set-UA check is unfoScript.readyState === 'intack, errunction} fnx, func '');

                 //If mainSg to thectiveScript;
    }

    /s con? cfg.deps.c each(ion that handles definitions of modules {
                                    m    ipts will block                               e,
     ing')        cfg.deps = cfg.deeqage
            //to load. If it is there, the * on a ownlounnormalized on   } else {
       {
               he
            //in for use as the
                    /f (!fo mainScript.split('/');
            quireme + ' at ' + urlnal baseUrl if there is not already an explturn true;
 aseUrl) {
                    uireMoe
             not a very
                //efficient use of importScripts,           es.
       di        } catch (e) {
             etGl            }
   (data.id)) {u    xt, config            t, textA    //Used  ree) {
             brrue)      contextName: contextNke nameToUrl.
eps, factory. Shoue dep{
    e) {ific name
                || cfirefox 2.0's sake.game,
d pu[ 0;  is stored on the ng       main: (of passing moduleNgen loadedeventasty.
         this.enabled = true;           contextName: c {
                      //Hold on to listener  .repnode);
(commentRegExp, '')
        eRegExp, function (match, dep) {
         *
     * If the fir     ca   mixin(localfor the main module.
  divire) {
       there are function args.
            if (callback.length) {
                callback
               ;

    if (nJS  || cf]lls, but still
                //could use exports, and module. Avoid doing exports and module
        e,
          node);
  //argndencies that are alr{},             uri:i    node);
p(argswillule']).coi                  avnterreplace(p = {};
         eractia CommonJS p = {};
                  :|\?|\.js$/;
    req.i    //If i do 8 and hit  do ymous define() call,    / do the) 'Load nteractive
        //w     ork.
      do theif (textAlt) {
                            tIt is mo dependencalk:  }
               :conte          e,
         :ode.getAttrib           the rge
            //to load. If it ise dep[     c         2 are lsSync '/'     fileN nodthe
                 e dep           }
        }

        //Alway//look for require    }

              = '.     ed f) {
                alues, deps,                 
    }; favor over pportfig, mo  //this specing map conf       ,
        /               scripig       >nt
     o fetcp con0], the script onlooning(regi retkup (the scrip>rt = orts use the glothat inc-1      //wheruntil tht
        //se the globafrt,
        //wwhere the rer i, pad artifics not known until uses_g ovelete defi// wmod.becexecTRUE  if    () eachP later  //this name.
          .amd = {
      es tuery: true
    };


    /**
     es tecutes the text. Normally just uses eval, but canternal transf[]    //    just pacs isn ju   };

    define.amd = {
 ')];
  in the rs, not ext theot known until childrame,
ins, n not sub-es eval, bu     anonymous mod          s an in the r         normalitext')];
    req.ex{
        eturn normaliz are id, de/
        re       normalized, no base54     /dify them, i > 0; of DIGITS_OVERRIDE_FOR_TEST tha     ion () {
tion/local scis m requirejs: require,
      
     enabback can
     * "etnisBruaflchpdvmgybwESxTNCkLAOM_DPHBjFIqRUzWXV$JKQGYZ0516372984"               ') {
        (deps);, Fi requig = f      requireble to help Caja complr) {
          ng moduleName 
 *  = 54{
        one favor of the interna requi          //%loppyname, localRequire, lMath.floo    n    source
//text is noppy si6ce eval encalready bnt.
elat0, support just passing the t    ;

alues urn mod;
stry(mod.hases.
        if (!deps && is         
    his;  new    text tho fetch. An opInteractisuppor|| segmction (relMap, options) {is.inite          t
     es.
       mleName, url) {
        var xhr = new XMLHttpRequest();

        xhr.open('bal queue, , unctiorue);
        xhr.send();

        xhr.toJSONge
            //to loa;
               ing
    s:dule suppor          //re be modif
       be modif }
        };
    }    ));
    } el   var prop;
{
     },t(cfg.baseUadystatechange = f '');

     
    ..
      carefu(),
   retuete
t
        //         v/slint evil// 1.Main,n'   }adow available via s
 * thejslintew BSD licenq.isBrow, unlessdatidosee:back]);
   part = ary[s for details
 m/jrburke/    define    
 * thust usxt) {
 !s for details
 gin t  };
    slowarI = i;
  new BSD licen2e.
 * see: http://nrt = ary[im/jrburke/requirejs for details
 */

/*jating ovv('fs');
 ctionwd: fun    t
     s for details
 t evil:e/evaluate.
  //twbal,require: fatue : globa details
 ) {
 lse       ng fCOPES    require.ew BSD licen3e.
 * see: http://g          he cock]);
   bu}

  s for details
 module n(possibly g      module nenabw) {
     } els}

                //Do 
    se.
 * se(++allback.
 );
  io              } t ? ppy 1arI = i;
     //git xhr = sed.
               e,
           e/

/&&alDefQueue[re: fxhr.response[mue,
= faiio,
     * but only ies.
    f it is already enquire2s for details
 */

/*jslint relse */
/*global require: falsere: faan up   dlse, define: m: false, pr
      lse, regexp: falseocess: false */

/**
 * This adapter assumes that3arI = i;
     and hit lDefQueue, m     ted RequireJS
 +
                     **
 * This adapter assumesI got      oNode :-);
        };
function (name, evrejs directory. The general
 * node adapater   url =//look for requirt.onScreright (che
            // {
          e global queue, reJS
ires* the use o          on( is on Names.
      con      g nodeReq(techange = ff (!fonewM
         main: (pkgOb can be modifi/Als {
        jQl when rerts ||ver         nvironme.
      nse in
   dencies that aand set up
  segment ==     if (n  return hasOwn.call  *  viojo          *
(obj, p           onErrosSync ||  url, trt
       Sync || path.ewn.caal   }yvailable ame is not known u        /hasOwnPropereturn hasOwnoduleName === "exporttion thfor u  //tous get   filequ     }
                  reonload-f (!fosue) {
         n. Broke      RequireJSontext, moduleName, url) {
 return hasO * @png} text thej, prop) {
              moduleop(obj, prop)ine: ame, rmoduleName +fig, mhe
            //                           */
                   i > 0; i -= engthrn;
 {
    'uGET', url, true);
        xhr.eMap.id;

path.exis 0; i||uleNamtModule([moduleName, (             ,
        vm S mod    r plainemove comments from the ca   url =amePludir       * loader p) {
 ng} text the';

       //Se  } else {
     ents is.requirejsVars = {
         node = re           v        filtesequence.
     requirreq;
    }

    req.version syncTick;h, 'utmodifiedt, t['require', 'export(shily for//args are id, d  context.nextTicewows for  context.nexMLHttpReque  context.nex
       to handle it         cleanRegistr           //n     arormalized by thee' tt.nextTi  context.nex                     // complete
       ext to ) {
                            text = texd]);
        //Normalize moduld be no          //ngin is loaded, can                      //sr i, pais is not a very
duleMap
      uleName, r // Determine               } ts: contexts,
        newContext: nen alis_omes  xhr =     req.omes t]);

            t
    };

 ;
       ?ugin is loaded    mods mod  //Create defau          rent config.
           function   mo
      } else {
s: con                the script.
        if ({    req.load(coar'texhis.map : this.m    if ata-main attribthe DOM inseme context     //of the appendChi, can regenerate the mo                var node, conus define
                 this.enablin   req.dconfi         }
          return 
    malized ID     function getScrontext.enablakeModuleMap(moduleMap.oeracers,         return in/Use                var           //nextTiculeMap     ontext.makeModuleMap(m      this.pry to dynamically fetch it.
  cute) {
  E 6-s for details
 */

methods on global requireerence from contexts instead of eof early binding to default coependencies
        if (!isAing') {hing safely.
            req.load)    //If the basteractive //The ab    //Add wrappipts(), fund the code so that it ge       //If no name, and callback is a func {
        var xh              ew XMLHttpRequest();

        handler.
        jQuersystem by creating     //Add wrappthat a build h      her use cases bne so that
      or('nodedefine) { ' +
  /only one script needs to be loaded an, the lat   */
     {
                    if (co
                //reevalevaluated if other use cases becom
     will
        dy found        importScrip;
                }

  //Account for anonymous modules
           ion (string) {
    urn '(function (portScripts. This is not a very
                   //ival immediate calls to the  if (modul{
    . Now that
             extName];
lized ID.
    reworked.
                       },

            e;

    if (ick
           a string,nction ,
    aBrowwhy    neaceseModuMap, thiprgs[) {
 * Constructurl, ejsVarss    
       }re: fa     cir will
      iapper(contenes eva.
  r'2.1.8      the text= '.') i    he rrapper(conten     ar cong ove } else ifjslint *t       req             //rted inp = /\.js$/,
  us d  if (modulrl);

     at
   );
            if (nts used.
 ed in )ncy striat
   he default context
 ' + e be modified        config.config[jsExtRegEriginalName]);

     teractive;

   lect them.
 ply(gl RequireJS ne the it         try s Reso     FileSync(url, '    ypeof        call requirejs eNodeWrrl + ' as moduleed as anme
  en an event from afixueueerr.orymoused with use stot fo   req.exe     ;ed in   }

  see:m plug        enabledReg = m      t up with // Adjust args if there ar         equires may          ) {
         enabledRegript | moduleMaetInteracti moduleMaymous define() call,        te'.(moduleName,     g diag= mod.mapthis.requioop(cont }
                       (module        up
 i    duleName execution.
    re = contexts[defContextN            (modul.require[prop].apply(c     suffixypeofp;

                     f you want custom error hrrentlyAddiequires. Now that
     ) {
                      to execute when alobj, pre the pt executes before the eonload-event-is-not-f        requirreq;
    }

    req.version = version;

-is-not =eMod.skis(-is-not,sed with usobj, prxt.makeShes if necessa originaln to e if (this.event   reqthis as                excepmalizedM                no        }ginsame] e is a string, then the  hasOwn = totype.hasOwnProperty;

    func!-is-notSync ||"require" || m+ '" at ' +
           originaltion (contjslint ereturn hasOwn.ca*globaobj, pred as an
                    me);
  &&      if (isAr + '") and it js directory. Tontext.defined[moduleName + '") a(e) {
       t(url)  dirNaGET', url, tction makeModulenalError = epath.exi= '   mo     r.moduleName = originas: con'                 'with error: ' + e)send();
s = fTried loading "' + moduleNam     specified: functio  ha(fn);
    };
s are sync, so        | req.n                //rwe alwaysed
     aon All Ri      text.@retuntil thxt.regFIRST, so
      h.
         * @//trues    meue iEFINE for de,node if=== s.prorue);
oduleNe-inpthe     : true */, #392, and causesrror: ' + e);
 nction e.warn('Shim config noback;me);
    };

 function ame the name of the module.
        /**
 * @ame, relModu          if (originalName.charAt(0)         if (callback.lenfor the main module.
  ts: contexts,
        newContext: ne +
                    err.or                           }
      
                        modExp.trule will be att        substring(index, moduleNa          (!relMTried loading "'args, mod,
                 text.
    uleMis not  else if (env === 'xpconnempletetr);
 , configem for IE6.
        /nalErro.makeModuleMato execute.                                (!relM }

 path.exisalError) {
                            /**
 * @license   };

}());

    }

 path.exisdefined[module                       this.dephat incl     //with the d                         ardefault context.
    rerent config.
             * MakuleMap.url);

            require c    //Support ae the module
                        context.enable.load MLHttpRequest */

t
    };

    //Create      (moduleMap, relModuleMapd to filter out deLib() {
lely to allow tquire([mo               jsExtRegExp = /^\/| for t* AvaoduleName =iascr* Avact') {
  for ymous define() call, (new Error("ie.load                         urke/requirejsp.id;

etInteractior = e;
ous define() call,the optimizei                 e) {
            node = currentlyAddhronously.
 ,
         uire([mo                                       text = texappendChild execution, so to tie an anonymous define
          exists(url)) {
       [ne: false */
            onouslame = node.gsome context               //The above calls are sync, so can dnull;

            ry.
         the optimize       == 'undefined')sitive methods on global require.e from contexts instead of early bindquire is defined as a
            that plugict can be sOwn(definpatch & typeof documenating    n that tivelnd caarI = i;
     re requirets: con loaded.
                if (cfg.depss a depewe("' +
()edName = nameParts[1
           each(                     map = makeModuleMap(deps, }

    y binName]));
            }
 MAP.a         return context.nameToUrl(ire(cfg.deps || [], cfg.chave dependencies
        if            ntains . or ..
    ly.
                    equirejsVars.define));';
  
                //reevalfined' && process.versions &&   }

                     }
 ately
s
                contex  });

    if (i     isBrowdyState === 'interactived the code so that ets the requirejs
    //API ins that a build has been done so that
                /portScripts. This is not a very
              context.comple||license Copythe optimizer, or  use of importScripts, ionly one script needs to be loaded anyway. Th;

    req.load = function (coontext, moduleName, url) {
        me common.
    the optimize             config = cots(url);

                     if (config.shim[moduleName] &&t use of importScripts, importScripts will bript.parentNode;
     varelf xhr = nists(url)) {
         to filter elfjs';
    }

    /**
     * Loadsv\}/,
       ng,
f modulesmain attribute to set muire([moduleName]= [];
            //Remove comme '');

                   get: funig info.
            //In the browser so use a script tag         node = req.createNode(co             -         ipt'["bar"]lse {
t.crbalse);
rvalt !==nd ca   },

 s {alre.reae Dojo      -gin a     ecubject.
   v= {},
        -t follow the script
    reqIFs    d-ext.req    foo()fined[ib},

 t('scrict F?ction:     }=== "[object Function]"

        &&ction]=== "[objefooof proces     },            baz  },

            o?     :Prop: hlModusng.oe/rerse {
 nceof RegExp;
        },

    tive  //k,
   retu{if RegEp;
        },,
        /     expired && noLo [];
                          latf_of
   1ction2g object
                  1lizedName =            2ltOnError;atMap(idt2d. O to t2ules likealue fgiven 1ut prefunction last_stat(b) {
    if (b[0] == "block" && b[1]012, The.length > 0)1.8 Chts return, The[o Foundation- 1];1.8 Ceserved.;
}

/**
 * @laborts(t 2.1.8 Copyrt) switch (icense r.jt)[0] 2.1.8 C  case "eserve":ails
 */

/*
breaks is a bootstracontinues is a bootstrathrows is a boT or new truee MIT }
};license.
 *boolean_expr(nt.  2.1.8 Ceserved( It isght (c) unary-prefix" Rights Rt othe&& membe It is[1], [ "!", "delete" ])) ||
to inject othetop-level
 * biist. to inject other files to completely einableinstanceofable==able!lobal=global rlobal< proclobal>false,file. It is
 * the shell of the r.js file.
 */

/*jslint evil: true, nomen: true&&able||fileto inject other finvironment. It is[2ator,
document, importScripts, self, l3le. It is
 * the shell of the r.jscondi * @al to inject other firtScripts, self, location, Components, FileUtils */

var requirejs, require, define, xpcUtilassign to inject other ficomplet ===her ation, Components, FileUtils */

var requirejs, require, define, xpcUtilseq (console, args, readFileFunc) {
    nt. lable via th)tor,
document);hino or Node eemptyjs 2.1.8 Ceserved!b ||yright (c) 2010-2012,(! The ||jo Foundation== 0)aded = {},
     is_string(node modified by the            jgs.js" It  inject othes = args,
  dist.js file r fis = ain, l "type */eadFile = typeof readFileFun file.
ned' ? readFileF+    File = typeof(t/args.js
    locargs,b.com/jrburke/rrequaded = var when_coy: trt = (/**
 * @(){ is
 *(typ$NOT_CONSTANT = {ino t ot// this can only evaluate avigator nt. essions.  If it finds anythingfined') not importSc,ned'commasof document !=.fined{},
      (typeofIt is modifieh) {/jrburkeop-leveon (path) {
 */

/*
      rd line
 *  */

/*
num'utf8');
    jslib/rhicomplete MIT ;
        };
amequireJS i        };ato        exec = f            r1turn fs.readFilJS in the crRequ in either a Java/f8');
        };falsog('x.js exwser  not applicable in bronullg('x.js ex     not applicabl}File = typeofp scrg) {
            rdist.js file };

        exists = function () {
            consol!g('x.js ex!File = functiloca not applicable in brounc : n('x.js exinc : dFile = functi 0) {
            commandO~= fileName~ing(1);
            fileName = args[1];-= fileName-ing(1);
            fileName = args[1];+= fileName+ing(1);
            fileName = ckages !== 'undefined') {
        env file.
      exec = f(typlefr !=       , righnoContext3ng) {
       exists = function () {
            consol&&"applicabl('x.js exFile = furhin)r fieturn (nFile = fuluate {
            commandOavigunction (fileName) {
           ||eturn (new java.io.File(fileName)).exists();
       };

         //Define a consoleapplicablew java.io.File(fileName)).exists();
 = function  (fileName) {
            e === 'undefined') {
            console = {
  ^             log: function () {
   ^e === 'undefined') {
            console = {
  +             log: function () {
   +e === 'undefined') {
            console = {
  *             log: function () {
   *e === 'undefined') {
            console = {
  /             log: function () {
   /e === 'undefined') {
            console = {
  %             log: function () {
   %e === 'undefined') {
            console = {
  -             log: function () {
   -e === 'undefined') {
            console = {
  <<     };

        //Define a consol<<eturn (new java.io.File(fileName)).exists();
 >>     };

        //Define a consol>>equire.main;

        //Temporarily hide requiree and defie to allow require.js to ddefine
  w java.io.File(fileName)).exists();
 ==     };

        //Define a consol==eturn (new java.io.File(fileName)).exists();
 ile:n fs.readFileSync(path, 'utf8');
         }w java.io.File(fileName)).exists();
 !turn fs.readFileSync(path, 'utf8');!        };

        exec = function (string, naue, string),
                         ontext(this.requirejsVars.require.makeNodeWrapeDefine = ddefine;
        reqMain = ync;

        nodeRequire = require;
        nodturn fs.readFileSync(path, 'utf8');<        };

        exec = function (string, nae and defin  define = undefined;

   e === 'undefined') {
            console = {
  >turn fs.readFileSync(path, 'utf8');>        };

        exec = function (string, nain     };

        //Define a consolins && Components.interfaces) {
        env = 'xpc: true */
        Components.utils[': true *his.requirejsVars.require.makeckages !==ckages !==commaof document != Java/Rdefined');
    'undefinnt. , yes, noon (path) {
try() {
          (typvaloConile = functio, asts, string, name, 0, nu.substrval () {
            consolpath, 'u     = ly e      r,ame.s];ndefined') {
             };

 ber     cwd: fun

  ) {
                return FileUtilsnvironmle("CurWorkD",turn, Sgs.js
   }
              return Fildefault      exec = f.8 Copyrme.su== else) {   cwd:[       ,      }e on front;

        exec args[0];
new Error("Can't handlf importScrofe.sub: " +1];
        }enterContext();

        execeservedyes.call'-') ==ast) {
  {
        } catch(ex () {
          opyrex {
  f document != () {
            == '\\' f the r.js file.
 */

/*jslint e other fifunctionFileFme) {|| reqMain, l '');
tor,
document, i/A relativub.com/jrbu        r fipath = xpcUtil.requtory.
                   args.tScripts, self, locats, FileUtils */

var requ)         path.indexOt(thi path. U i < ary.substr(0, 2 {
            co);

        exect(thilse= '\\nots, reqMa= -1) {
                    //A relA relative path. Use avigurrent working &&"             for (i = 0; ') ||e wholeripts !== ' isundefined'))  bu    e lme.smay be..;

   ce(i - 1, 2);
  commandOption = fi         return rme.substring(1);
   0) {
            cor (i = 0; i <  !==ve path. Use  = fativ     ?ring(thi :     ))                      i -= 2;
 the shell of t(i, 1);
             }          
var requirejion (path) {
              = 0; i <           }
                     2            for (i = 0;        IGNORE... retur= '..') {
            } catch (e) {
                part = ary[i];
     
    } eo ? noirstChar !==t is m: else if (typeof Packages !== 'un     s[0];
ex           ileName &})()no or Node ewarn_unreachable(asttp://github.!   //Uing            enc("Dropping ding = enco cod       gf navdoding,her aby jslib/xpconnecprepare_ifsding || "utf(type == '/_walker(), ath) = w.ath)e MIT h + n ||
  first pass, we rewrit    s which* see: with*/pa          anfined') if-    .  For example is a //c['@mozill (    first/uire('blah                    if       .cr with // foobar        .cc['@mozils       ten intoinput-stream;1']
                               .createInstance(Ci.nsIFil inStr             ream);
         ileInpu/**
 * @lredo_if(e r.ementson (path) {
           = MAP                     h));
   forpathr i = 0; i <nstance(Ci.undatio; ++i () {
              f  costance(Ci.[iis, string, nam
   fipart!= "if") impng Re;
           Ci.nsICon3]tStream.DEFAULT_REPLACEME    cwd:fi[2             Ci.nsI! see: httTER);

                    co;
(function    alkICon1) {
               coe_body =                   .slice(i + 1= path.charAt(0)     .len    }     //Used1  },    }part: //T2010-2,      } ].value;
       eserved{
               0, i).concat([ [ile(xpcUtil.normaConve,             Inpuile(xpcUtil.norma;
(function conv//          }
ile(xpcUtil.normat convertStr          Cc['@m             
                     ile(xpcUtil.n] ) {
        }value;
                    fileName && fi                _lambda(om p, args,    }on (path) {
   } catch (e) n (st not applieserved[ ||
     cec = function (s   }File = xpcUtil.readFile;

   2010-              .createIn        };

      stance(Ci.n!       ?                     g) {
 ion (fileName) {eservedw.    path);
s( (path) {
"defuve .le;

        e,h.
       indexOf(typeof console === 'undefine2010-2ypeof cons2010-= 'undefinesp         log: function () {
   topleve };
indexOf('             .createIng);
        };

                          ng) {
     }.apply(undef{
  uments);
 t, c, f     }
            };
   if (inStream) {
 

     ile: function (/*St      t) Rights Reserved.
c  //Define [ c }
    }

   cion (' +      Rights Reserved.
f  //Define a consolfeasier l
             t can deal with B,uments);
 e(fileName).exists(rn reing n (fileaded = {},
     for_side_effectileOb,part, as modifietil.xpfile(path);

                //XPCOypeofstop= 'un, $restarcwd:undepcUtil.readFipy: , #3gs[0];

py: tndow, navigator,/*globaument, impor/*globalndow, navigator,found(){       /t may nirstChion ,tion , w  };op    globa)bal) {
    var redist.(opon (path) {

   : trlog(+     t, subP--ectory.
       ');
    , s,.applyaMain, argu      n (fileNapcUtil.readFi file.ngScript, mainScript, subP = f
        v||sion = '2.1.8',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([      //get fancy though.
       cense R, s,.apply(undefommand\.\//,
        op * This \.\//,
        opnebject.prototype,
   /jrburstring = op.toStrinp scrip\.\//,
        opnning Requ\.\//,
        op     norray.prototype,
   a  };
.\//,
        opi = f.\//,
        opfoile(navigator && window-iisBrowser = !!(typeowhilpsp = ap.splice,
   doject.prototype,
        ostring = op.toStrin = 'rhino';

 lyAddiicates loaded and ostmplete, but need to wa;
(function Property,
        ae) {
  \/(.*)$portScripts if (typ.\//,port in browsers,  (path) {
 && t (ata =                   /problems with  !== 'undefined') {
                firstChar !== '\\' &&
       )            return F '\\' &&
   teractivetream.DEFADojo Foundatioon that can deal with Baded = {},
     le(plift_variencoileObj = xpcUtil.xpfile(path);

                , scop       /**
 * @ldo    }n eva, envon (path) {
    _pera.ableera. See t nameera = tenv             } caConvra forream);
.
        ishashtrue */om p.nsIConvenv.xts =n browsers,.subtexts  check is u/github.cyperterIvar")p = /\.jMAP.skipam.readString(inStr    referencesxec =)ctive = false;

    function is    [om py.leists not applicabl        }om pen strict supect Opera]'     ts =undation All    }
         // lookconv         ne(Ci.ntoypeo     hese   iontext.splice(i - 1,//        savf impoideram,
 space by movconv    definunctisver an array. Ifiou s iter declara * @.splice(i - 1,transpiler plugine);
       unction browsers,s thaath);
      interactive       path.indexOf(':astire,
        nodeDefine, exist     ary.    in, loadedOptimizedLib, exi], i, ary)) 2]part ===om paile(xpcUtil.normalize&& HOP(    == '/         i -= 1;
                 inser      l break ouinit( */
    function eacile(xpcUtil.normalize           co.call(it) ==; --isses0;         throw new Error(patring.call[i     }
    * Helpe        throw new Error(patdexOf(':nc) {
    {
 ') ||
  ray(ialreadyy backed     must     ile(xpcUtil.normalize(path));
    docum         }
               peof i = ary.lepfile(thisgth l break ouile(xpcUtil.normalize(path));.call(pushg.call(      (i, 1for d                   break;
               return Fil        part = ary[i];
     ) {
        return hasProp// removnctiis
     * Hel from */
 AS';

   rties in an obje   f truath);
.    nt
                    bre
   p        jsSu
            var i;
           fa = ptream.readString(ation is stoa.unshiftonvepundatiosOwn.call(obj, prop);
    }p       mentRegp, a         } catch (e) {
 ile(xpcUtil.normalize         alue. If ttat function returns a truthy va         */
    func,        )        // };

          for (prop in obj) {
            if (hasProp                 i -= 2;
 )) {
                    bre) {
            if (ha opera */                part = ary[i];
     )) {
                 return ostpera.toSed.
     [Interatexts =   }
          pera !== 'undefiOpera (string);
          }\S]*?)\*\/|([^:]|^)\/\defCdefs(nctiason.
        isrecwd:else if (typeo           conctithe loop.
     */
    function eac   fusProp(t               Ci.nsI!d.leng ?
                    (de//Th    nodData ely eom pathdpart]op])1]en strict sudexOf(':                   d                         funceqrop]    ten strict support          target[pro }

wfunction nverterIdow.   firstChar !== '\\e, deepStringMsubP isWebW           }

            }get[prop]pStr0                    ive = false;

    functioeepStringM] = value;{
                 eachProp(source,fined, an eval(fileName).exists();
        of isOpera for
   . 'undet:ts=4:sxRegExp = /\.js$/,
        currDirRegExpd') {
     indexOf('ec = function (stefQueue = [],
           counctthe loop.
     */ }

! func 'und(it) {
     unct[i]);           }

    ctionp {
               of vaurn fn.apply(obj, argu   returay(i          if (fog);
        };

        exists = fof isOpera forurn fn.appet:ts=4:sw=4:sts=4
 * @li    // th be.
    function bind(obj, fn) {
     of vaturn document.getElementive = false;

    function is   return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
 }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getera:e, functi.apply(undefined, arguo Functiocomplete'. The UA check is uauses
//problem_addOpera        with requirejs.exec()/censequeez  readDopk outtotype.b  cwd:n ID on_1 a web page.
 ct Opeparam {String}2message human readabeserved     ino or Node e{String} message human 
     * page.
sProp(   ns( page.
,
     * Simmake_seqs     if (!epStringMdead     id, msg, err, requino_ encings :      err, requikeep_compsd, msg, err, requiunsaf;
     sg + '\^(complet'_',
        //Oh the tragedy, detecting opera. S\/|([^:]|^)\/\neg= fucason.
        isnot_c  }
  dist.js file bal ", c    }
      /jrburkee.
 urn fs.readFileSync( = 'rhino';

        fileNaeservedp://king d2012, vironment. Ice(/\\? ia ahub.igin             = {
  eq            retnalE      c if target doesc[clable via thagNa(err) {ypeof requirejit('.'), function (parer,
        //do noically. Sequed') {
        //If abest_of(loadeely e;
(function ,a def,!== 'undef2])eturn;
    ACTE     if (isFunng, name) {
            return : tru   retrhinoCo    valuateStr  cfn scripts() {
      page.
.quirejs.orom/jrburkegScript, mainS if (fileName && ('x.js exe);
file.
ackag //AllvaluateShe
     * iteratitsForNode(f      //assume it is a lobafig object.
        cfg = require;
s !==      //assume it is acess }

    function newContext(contextN       require = undefined falsfig object.
        cfg = r) {
          ndefined' && !isFunction(require)));
        //assume it is a readfig object.
        cfg = require;
per(s      //assume it is ae, prfig object.
        cfg = require;
me) {              //config tto speed up normalize(), which
          tSeconds: 7,
            ile: tfig object.
        cfg = require;
 = fu('x.js exng requirejs instame it is a||get,(err)      gistry = .File( = requirejs;
 xists();
      config: {}
            },
           ars, stry = {},
            //registry of just enckages !== 'undefined') {
          }
        loader,
    = xpcUtil.readFiakeEr;
(function(c,
        xpco      ifakeErrealefEvents = {vertrowsers, #392, and cdexOf(':e.
 leFunc !== 'undefined' define is 
            var i;
ileName)icensance.
           r a e, tithub,
            regi /**
 config = {
         /**
     * Simple funcmalizedCounng requiile(xpcUtil.normalizeter = 1;

        
      l Rights Reserved.
a .. will become
     (err) {

       ile(xpcUtil.normaeasi/cycle breaking co    onfig = {
                \*\/|([[prop];shortc               defiion fo if (part ==has a importScr(typ}
        auses
//of navigator},
 i;
               ot sure how
    ncoding = encod     },, msit('.'), function (par               }tnew  }
         , = [],
            defs\S]*?)\*\s, setTimeout, mrn xpc2010-cript, mainScrip2010-  //Defin rea010-ght (c) 2010-2012, = ary {
            var
                //Used1           }

          =     if ([0fig object
                 if (     //Used bplice(i, 1);
            e);
               mixin(targeteserved.010-n (fileName) {
              exec = function (string) {
           };

        exists = ftuateen) === '"     e"first, sincefined') ||
  he usage ofek nofewfiedngsinput-st 1. discard uselessy[0] =t of t// 2. join impoecutiv
    function eack. Otherw3.;
    }
obviousl= 1)ad          .cr4. transformere is likelystance(Ci.nus, it wilcomma operator     .cr5.
   [0] =_    usubP //path andned'detlugi imporru    lik    (footion getGled:-       trof ..
  (!     {                            erterInputSte most rea   .createInstance(Ci.nsIConverterInputStream);
         stance(Ci.nsI{
         reduce= 'undefina  };

    //dot notation,{
  ght (c) 2010-2length; i += 1) {
            {
            var i;
    a, promentReg       Data.vrties from source into target, segments.
         * It lize ile na path.charAt(0);

                ifa trimDots(ary[ta.value;
   stance(Ci.nsI      }
     prev
         * @pa{
         forEach= 'undefincur
         * @paoperty varev      cu(part ===terapartap cthe value. Sls.File(xpcUtil.normalize(path));
 to the valuavigaShould
         *dency               for (i = 0; d
   ejs !
      Stream) to t      if (isFunct to a path.
         * @paramaram {Strinleanction getOwn(obj, propap co= curreal name that can be mapped to ait('.'), function (parram {String})(aseName a realcript,eof rereModules)l name that the name arg ishas_qui    }
        }
* to.
         * @param {Boos    }
        }
dexOf(':'/'),
   
     * Simple functionodule          ') {
   p =  = map &&     //
            var i;
         {String}       for (prop in obj) {
            if (hasProp(obj = map && e. Sh
            returns   function eachReverse(ary, futypeof re new Error(           }

             var inStrVerating functioed    ertStream,
     "sOwn.call(obj, prop);
    })) {
  IConver  retd = {},
 def,
                m         starMapdefThe Doj//otherwise, assume it is a top-level require that @param {Array} ary t            if (!target[prop]ef) {
    Name))asOwn.call(obj, prop);
    }

      //ass        ction getOwn(obj, prop) {
 sOwn.call(obj, prop);
    }       if (name && name.charAt(0) === '.') {
                ////otherwise, assume it is a top-level require ram {Array} ary tif (name && name.char) {
            if /**
     * Simple function       if (name && name.charAt(0    les to  = maely e * This,op = Obj     scri,        apsile.ile(xpcUtil.normalize(pat'/'),
  on]';
    }

    funcegment,
                foundMap, foundI, foundStarMap, starI,
                baakeError( baseName && baseName.split( rela
     * Simple * to.
         * @param {Boolean} applyMap apply the map confid
         *{
   quireo the valu{
                if (func(ob
         
        
      ,dBase                  baseName, applyMap) {
            var pkgName, pkgConfig, mapValue, nameParts, i, j, nameSegment,
                foundMap,      undation = 2eal name that can ary[        -      }
  {
      pkgConfig = getOw(n(config.pk  i -sonab * This nam          name = name = Obj                  tOwn(config.pk1y.leneal name that
         * @param {], prop         - 2, 2e first path segment, ent, to          name =
                    }
    : func     n(config.pkgs,namekgName + '/' + p ]        //are registered, but foundI, foundStarMap, starI,
      ') ||
  increases jQuerye va1K.  Probablyundefsu     good idea after ally.splice(i // pobalion foff s done             fiypeoway               } else t reasonable
     baseName && baseName.spli,           }
             is unfortunrtStream.init(inStreaeParts.slice           lice(0, baseable(),
       ++   normaliz         for (i = n
        /**
   iflized!    *ACTE;

                for (i = n           nameSe      }
  .join('/&&     *    /rget[prop]0, i).join('/');

                   baseName's
    akeErif(stry =     * a  },
         {
                egisme, pkgConf baseName segment match in the confdefined') {
   ('/');

                   eepStringM('/');

                   urn r  cwd:icense r.j       lest lengths of baseParts.
               ue =rts) {
                     //Find the longest baseName segment match in the config.
               * aSo, do joins on t       if (conve-1)
   , do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                      = 1) {
                       {String} name the rel           = 1) {
              foundI, foundStarM']
 )onveaseName a real   };

        readFile = xpcUtil.readFi        ,
            defQuTE: this method MODIFIES the input array.
         * @pa (path)ize against it,
    Partrn ref (name && name.charram {Array} ary ton trimDots(line
 * in eithe namif (i === 1 && (ary[2 to a path.
         * @paramTagNrn re              if (foram {Array} ary tf (name && name.charmalizedCo
                        breatrimDots(aryd = {},
            urlFeeserved= [],
               ) {
        return
            for  see:_    },
            defQueue      }
 rue,*/
/le name look    return ostring  /**
         * Given a relatip, nam {
       retStream)  * a real name  segments.
         *rMap propf (name && n] === '..' || aryrn ree);
            , part;
            for ching
               the longestnalErn re
    }

                   }
    

           I,
             //Ue\\/g,   //U         var }
        return tar               foundI = ilab         urlFenalE (err) {
               efin= 1;
          agName('script'); segmen foundI = st       nameParts    name = nameParts.joinject Array]';
   if    hc rebothand no        ry) ybened'akeEs senunctoefaults.them? https://githu'. The UA check is uruthy value, the         foundI, foundMap     e.orsplice(0, foundI, foundMap  mapValb(scriptNode)nme, pkgConfig, mapVopyriundation<         ize against it,
          conm tru     fileName =       found but we want the di
       tm    function isameParts.splis, i, j, nameSegment,
            y if target ere is a s if (!foundSrMap &     * thOwn(starMap, nameSegmen namePa       lice(      }
              }
         ng require    for   }Map &like paths, but can beso th(con2ame               return                   {
                if  founlength; i += 1) {
       args,
         into target,
     * buallback(id) {
   return tar undefEvents = {},
  ame.
readegistry of just enabpathConfig  see: he                    //'       star map.
                       //A file read functs.
         * It wil   //Pop off the first array value, since it faile          //are registered,     if (pathConfig e  }
         args               //base|| resource if (pkgin, rehe Doj and
    }
               //Pop off the ftance,ay value, since it failed, and egistry of jusin!resource to [plugin, eam.availab //did not have a pldStarMap &n be r    normalizedBa            r      * Given a relative modul and
 undStarMap = getO and
quire.undef(id);
                context.require([id])      require.undef(id);
           e a pl       }
                }

        if (pathConfig &    index =   function hasPathFallb         context.require.unde] === '..' || aryre     fi')) {
            do_ && t(;
(f of the line. Keep at leas method MODIFI  * aaram {Bool  * a    }
                !            }
         ram {Array} ary t eval(string);
     }
        ret                   break;
                    }    //assudow.,b.com/ relative namrn ren (strremapped. But the end resu, part;
             //get fancy though.
       subwill be.
   -') ==+= 1crip.map,
             //Iis done args,
        rize against it,
     e.orByTagNe ID.
    ing) {
            map =is_identifiertElemenpathConfig.shift();
     //assudo tar      
     ray(it) {
        if (pathConfig /^[1-9][0-9]*$/.testtElemein by the unde0eScript(id);
                 retuub      *
       kD", []).parseInakeMod, 10githremapped. But the end resu 'undefined' &&        .apply(undefined, arguments);
 n (string) {
   prop] = value;fined, ar              et:ts=4:sw=4:sts=4
 * @li.hasOwnProe if this calloduleMap ? parentModpValue = ge& fileObj.pa- 1t('.'), function (part)             *
       ng() === '= parentMoranchvertch(scripts(), function                 eraten normalize(name, base* Shosonaue =        i(it) === '[object Array]';
         e.orid        iflse;
        a the MIT  eachReverse(ary, funn showHelp() scrimePar ? read                   //'one/lse;
 nction scripts() {
readFile: function (/*String*[    if (0] ?               easier l       x, nameParts,
   et:ts=4:sw=4:sts=4
 * @lid') {
     sole === 'undefine    // tconsole = {
              = parentModuleMap ? parentModopyri      parentMi = 0; e);
                      n trimDots(ar'loading', 'loaded'      isD  infig object.ame ? name.indexOf(ame via require.no,
            inrn re{},
   rn re  //regire call, gf (f(c
            //intenfig: {}
             ified
   name = name.soaded, use no            urlFe = function        each(scripts(), funcdexOf(pt, terI{},
&&    terI!=active = xtName) {
            urn rme];
   {},
   turn//Plugin is                 //modul( partl = {},
            requirldefine is alrel       }
   umeScript(id);
          }
  rhinoCo['num', +!Name,1]   normalizedBaseParts          r(namlevel
 * dist.js file ule.
 efine is alre    , applyMap);
                    }
   luateStr      } elmaliz                    //A rzed, app{
            fig object.   normalizedBasePa}(uleMa     of the same name.
     */      if (prically. Sequencram {Bool
            defQuer in a matchingfEvents = {}       no            *
 d);
         ts=4
 * @license RequireJS 2.1.8 Copyright (c) 2010-2012, The Dojo Foundatp = / Rights Reserved.
        able via the MIT or new BSD license.
 *         p://github.com/jrburke/requirejs for details        ot using strict: uneven strict supicates loaded and complete             nction (path) {
     return   *
     row new Error((fil     }
  r = err;
      f the id    if (index > -1) t, subP!        target[prop] =llback(id) {
   stry =      it('.'), function (pars method MODIF{
    the input array.
         * @pand causes
//problems      t's eithermsg,  org + '\n so miny beper f!0nnor!1edName = pluginModule.noument parentModp config values must
    eturn  global that eeParts.slice(0, bjrburke prefix,
             console.log('x.js exrror = err;
        }
 kD", []).0                   in browser env');
   ap: parentModuleMap,
           1    unnormalized:              prefix = && typeill
     splice,
        isBro             
    , r
    ame ? name.index?
         });
      t('.'), functiox + '!' + nor       row new Error((filokOps {E[ '+', '-   }/   }*   }%   }>>   }<<     ffunct|   }^   }&'stamp it with a unique IDn]';
 rentN
    e = na
        norm           mod) {
      eal name that can~ix
  .indexOf    nor     Own(registlize(nammod = getOwmalize method.
   id] = newin, loa        {
            var i;
   };
        }
   od = regx ?
                
         * whlved relative
        };

      fix ?
            t:ts=4:sw=4:sts=4
 * @lif windowe if this callunct           }
    hat cannot be determined if it          ba#' + id   if (part ===    f (name =ame = name      res, reqMa2g undefos, nor 1,
            unnormalizedC(string) {
       pMap.id,
                mod = get-') ==s a runctioream)t:ts=4:sw=4:sts=4
 * @li

    it can be(numfor relative paths i!isFreake   fn       target[prop] = value;me it is a/ve remontex1 / 0ile(xpcUtil.normalize(pathunter    origihub.c      -         }
            }
        }

r = err;
       -          origi,
         * which     };

                                } finally {
          };

       umen strict support in browsers, #392, and causes
//prob         filid) {
                d the error ID that maps or.
     * @param {Erro= '_',
        //Oh the tragedy, detecting opera. See the usage et faStrings,== 'sason.
        isnc re typeof      opera !== 'undefimalize. Theive
  treay if target          av   if (source) {
 ModuleMap isee the usage             //End of the line. Keep at least one non-dot
        eout checksurn fn.appme);
ry(MAPe = trerror &first, since it is easier to read/figure out whatdirecikel     prefix:did is a plugin id   //I.appla  req_      reqr);
 se {
                    mod.                  bre            reqj, prop);
 ts=4:sw=4:sts=4
 * @licarentName = parentModuleMap ? parentModuleMap.naion All    }
       ied
    //   }
                });

                      pluginModule= getOwn(defined, prefix)     eto an URL with more information.
     * @param {String} id the error ID t/* -    [ re-genfail
      Cycles over  ]      */ ((typDdocuALL_NO_PARENS = jsp.array_to_    (, The get[pro //on      ext.
   objectext.
   ction () //on      ly(defQap)  //on f win     [dregexp
        if (t
ta.va        if (!frgs.js
st!== 'cii_     {
         dq con, s     true;
stturnstr.replace(/[\\\b\f\n\r\t\x22\x27\u2028quire9\0]/guffix = pres
               nam             (!/

/*
\\= fileName"\\\\"requirejs;
       \s tr      retub mod.require;
       = fileName"\\f mod.require;
            turn (mon mod.require;
      
   equire(modr mod.require;
      uire'  }
         ports' },
            'export9': function (mod)9{
                '"': ++dq;}
      '"'requirejs;
       '"od.msp.isDefine"'{
                mo0  }
         0{
         ] === '..' || aryeadFile ntext's      obalDefQue }

  to_         se {
      dq > sqere is a "'          handler 'ren (m"\\'"procs) {
            fine) {= {});
            2n (m'\\"'proc) {
 ino or Node ereturn (mod.ed by jslib/rhi      handlers u0080-\uffffon (mod) {
   ccriptNode.get      unterch.charCodeAt(0).        (16ntext's
   nfortunse {          4!== unter"0      id(string);
       n (m.map.id,
     plete|lo   fSPLICE_NEEDS_BRACKETthe one
                  var    isDeble o    solve             ith    lDefQueue));         readD     *
     * @returns {Error}
     */
    function m    nnse rrncti0     if (p      /ed, a : 4     if (pquote_key(id, m + '\nhttp://rea tru_colon        e     if (pbeautify);
        e     if (p                   c = pkg ? ginline_ done       e.requireTinternal         = !typeof re                        n eac          new+ '/llbac       ?t.mak : "eue.lena true                 retu            for en  id                        if (!foun
                      ba           return ostring      bad + '/' + pkgion = '2.1.8',
  StarMap  handler<\x2f done ([>\/\t\n\f\r ])/giutId\\/ done $1rl in the en parentModuleMap is provided it wakeEry thme: normalizedNamsByTagNaame  return (          }
                      File = typeof ByTagNreturn (m pref waiting modules.acedn (fileName) {
              (+ '/cript, mainScrip                      prefi           += 1) {
           it('error', mod.errorrepeanse s.js
" aliza       }    // For +onfig, mod.ma*            eached, aprocd.er waiting modules.          
            for et faif (modtrea,f thecript, mainScrip therget[prop]);

  

          nfig, mod.ma+=              foomma  //If a ontmentReglize(p      /(\/\*([\turn)er way to dofinalletednfig, mod.ma-hat havl with BOMsue;
           st_      exports: defin }

      stry[id];
        }
ule) {
        A, bation = '',
 , part;
            for razy
matched up
          ule) {
    stry[id];
        0ig, then favor over this m {S trus(a]; i += 1) {
    else {
              foundI, ., th
   ect Opera]',
  quir[}
                    convertSt        m, encoding, inStream.avanexrefix[        normalizedBab      as);
              }
       e(depMap);
          patd only be matcheeen matchep, tristry
                   & !processe                        //'one/  }

        function checkLoaded(||&& !processe] = tsonab\\    .File(xpcUtil.normalers +\-]tion makp, t           istry/^k,
   ion makeext waitInterval.File(xpcUtil.normal }
            sonab/fn(de            var map, /ns {String} normalized ycle(de              //Turns a plugin!resourceserved.               d, depId)) {
        n sti               epId]);
       , = {} tru, part;
            for unctiohesizfunction (path) {
   fgemap.akeE be determined i           co1
      (\/\*([\                  } else {
     e            /               Ci.nsI(el;
        CiF**
 * @le
  Char !      if (part ==emit('error', mo            (           )od.exports;
                geplyMap)
            for ng requi             mod.         ary.suginModule && pluginMoai -= 1;
     ere is a sachProp(enabledR          throw n        a to the ID.
      the{
            ed[depId]);
         =          ? a : BSDexports;
                ng requi    
   odules.
        1;

 , part;
            for needs_unctisunction (path) {
f(':') === -1) {map['*'];

  ') === -1) {apsp.apobject Array]';
   dot/f wi his  literaltil.readFilequirrmalh}
            tStr**
 * @li.error)itself    be             'complf the modul     iined'     crazy
 "     "     {
   ,
         *        .  T    mean    a      unctio it of the loop.
  turn tar    iefinuld als it ha {
   on rver an array. If t'rncti time is   */isId)) {
         //If the modulired) {
         irue;so on.  Mess;
  uf           e modulf (hasPworth and ttroubleproperties in lue, the      w.stack()), d, an=e naocum,nd ca       aced, processenfortun && !isFunction(reqerty value. If t
     x.js exists not applicable        value. If the     alue. If f wine) {
        ined') {
            e) {
         
(function istryp        d, a             //It is p   }
alue. If ) {
    ) {
               ep looking foit for complet(!map.p[id])) {
   ize against it,
                     scriptNode.parent  removeScript(modId);
  baseName, applyMap) {
           ');
            return falsean be mapped to a           if (!mod.enable!    ot just reassign t       hasOwn.ca    delete registry[id]um   fn(mod.error)     }

  num  return (m0               handler^0\./, ".")nRegistry'e    }e's loam
            }Math.floor   fn({
    fn(mod.error);
            */ize against it,
     {Strin"0x    leCheck = fals6   rLowerCase                pointtly ile(xpcUtil.normalize(paod.mapleCheck = fal8till   *Regibe mapped to a path.
         * @param {Strin"-f wait(-    me expired, throw error of unloaded modules.
                err = makeErro-d.map err.contextName timeout for modules: ' + ne break.
         m = /^(.*?)(0+)$/.exec } elsength) {
                //m    + "e    m[2 (part =}

        //Turns a plugiregular mo   if (0?\.ycle(.*eCheck) {
                eachCalls, fu2ction -     funcled or iod) {
        e first path segment,    += 1) {                d);
            if (pa.enabled) {
           at the ftil.xpfile(path);

           akeE         //XPCOready normalized.
         * This                      rror') {
                n {
              ry[id];
 wn(defined, pbuggFile('. The UA c}
       r it, bu;"       * defQueue.
         */
                 }
            };
 akeErble.
 stance(Ci.            eal name that can              +        ntext's
         * defQ         ffect.
                if ((isBrowst andred) {    unction for each
                                 cl, plen name ? name.indexray. If th    l name.bracketff t ||
     }
            rowser || isWebWorkermentRegExp = /(\/\*([\s\S]*?)
         * for the module name, used toConvsWebWorker) && !checkLoadedTimeodData = if (name.indexOf('./') === 0ed, id) &d.ervert            var i;
                     }razy
 d.err   /; i -=    eac               ,
                        in Al ? if (mod.error:            varlizedBaseParts = base          che}

        //Turns a plugi = {
              sWebWorker   }

    /**
                            (!moequire(m   f    tTime(),
  ConvConst      1 funct)     ;od.exports;
s must
       st [],
               this.enabled, this.f    ihed
            */
        };

        Module.prototype = {
        cense RequireJS r, ca, fncoding, inStream.avaou   }
                  (expofig object
    if (ca)ppen                heckLc    ed = t             c
    conflict can be.nsICocalls for thgistry,ot
           fi conflict can be separa           ou     starI = 
        op = Objecte if this cagistry, function (mod) {           theone/two           ]Module.prototype = {
        g,
    dule;
   to                   (!mounctfunction () {
];
    odule.           */
 unctio          }

 d;
        }

        fun             stil,f the f of the same nam     )                    this.factory = factorg,
                r for {
     d.on(name, nce.
                                 } else if (this.evtil.xpfile(path);

   '/')   if window, n- 1, 2);
                        i -= /get fancy though.
         err = makeErrop(defined, id) &ment, impo(err) {
       retur   err = makeErro 'this' will be.
         '';

allba) {
            if (haete'. The UA check is u('error', err);
   not be determined if ite same name.
     */
   g perf issues.
        readyReChar !== '\\' &&
  (err) {
entName, applyMap);

      e if (!mod.inited && mod.fet args[0];
hat can dealameSegment,
            on('.
  {
                if (pr               isDefine = true,
            this.factory = factor, then itodule.           is not
          nurn xpcname) {
                if (prep = Arra= getOwn(ab    eady done. Can happen if       aced, processed);
ld ha  //DefiutId) {
          pen +=     .inited];
  ld havut there are error lin preule.prototype = {
              apsp =   //Could have option to init this moduot known enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not              //alreadoifie,                   this.factory = facto        //on toss to the deodule, s         if (, "?              norma                        //on      the f, ":          } else {
                    this.checel);
     this.errback = errback;

          id: (prefix ?
                        prefunique name, pan]';
 )    evio=ed previously,      : trut can be called mthis.factory = facto     malizedetOwn(    this.checpMap, nction (i, depExports) {
                        }

                 happen if          , true;
gator.platform ===  (part ===ap);
ength; i += 1) {
      !/[a-f.]/ion mak    f this map is for a den previo.ed previously, od, {}, {})
       ixin)ap['*'];
ed'       if (!map.is/or could have been pr= this.i        true;

           namePart        //Do not/or could have been previo.sly marked as ult of a cy++     if (isFunction(reqourr;
         if (hasProp(defined, id) &n;
                   (!mo.avai      thn;
 raced, processed);
fif (getOwnretur(           }
     now.
utId) {
           loaodule.f           context.sname) {
    s.on('error', errback);
                } else if (this.events.error) {
                    //If no errback alreaap);
                pluginModuleakeErn;
     wn(defined, prefix)) : this.load();
       ' && ne and dependencies.
               happen if th      his.initedcorue;

   eine akeEr    (scri      his.cfig object
    if (es.
                    i                     = path.charAt(0);

                if.inited) {
                    returndow.doc (baseParni 2.1  * astep       ve option to init this mod resolv) : this.load();
nree.jndenc  //Define lPlugtche.cal"           /;*\s*$ }
 ;               r            d[ur   }
true;
         
          context.load(this.map.id, url);
                 d[ur defitrue;
                    context.load(this.ma    //If no errblue, .
    tchedap.ind= {})e    function isFunc  chec= "; ; ")   check";e.prototype          },

 s.on('.
  is not
     ary[i]              if (this.inited) {
                    return isWebWork        vvar, keyn (erh       if (!urlFetched[this.factory = factor    varheckile(xpcUtil.normalize(path));
                     context.loa+       callPlugkey)p = map;
            this.shim       n          } else {
                         rue;

        ary[i];{
                if (pr && typeo()
         uncti    depExports = this.depExports,
                               );
    (this.error) {
                    this.emit( !== 'this.error);
                } else if (!this.defining) {
        or) {
                         //The factory coul  if (errback) {
                   ostri this.depCount -= 1;
                  baseName ) : this.load();
    n, s      //      },

                        if (this.inited) {
        //the dependencies are nefix) {
            fail, x ?
                        prefurn rhinoCoched[i]) {
   luateStror) {   normalizedName) + // XXX: I'm    tk;
 ure o      inCs will b  trherr modules: ' +            }
   d it hsmarter                      addconv if (!2);
      im        u + ist bet modules: ' + ule. For in                        rrback to pass efinejs foeal name that can            p() {
       PRECEDENCE[        ] >              return argsllbacks (#699). However if a gln;
                }
     rmali }
            },

 rhinoCof agairhino          context.sa cycle.
         les to (registryn
                            //their callbacks (#699). H(registry, iglobal
                            =            pMap, nam    eal name that can! mod = regexpo        r files to           jsVars, navi,          context.require([iduateStrf agai                 req.onError !== defaulrt baseNam         name,       }
        };     tch (e) {xpor<xp = /[xt.execCb(id<;
                    }
Own(registry, ingth - 1,l = co done etch: fupMap, nam = e;
                        usly       function () {
                var url = this.[
                ject.
 ntext's
         * defQ      }

            //If         pCount -= 1;
           me.sub            needCycl,

      ;
                    op-level
 * dist.js file mePar    OPERATORSplay,
     +e {
          !      }
           utId) {
          me.subf agaime.s                     enabl           (one
is_alphanumericmatcheue and eif (getOwnnoth            vae = namePart need to wait for complete
eturn value and exports. After that,
                                //favor a non-undefined return value over exports complet                               cjsModule = this.module;
                                if (cjsModule &&
                   sModulue and es.errback = errback;

 is true if this call is done for a define() m,
        c                    //favor       }
                this.fetched      cf agai                          enabl        [sly markle ID.
        ]turn map.prefix ? this.apsp.ap is not alrpro= 'u     //Regular depebj_      }
    splics.error && this.s[i] = depExports;     (part === '..') {
                     = this.map;
   this{}eady, {}ed previously, t this modu{('tim   checkL          de                //"shim" depn(undefEven     deps.
     p                    retur (    func    3.shim, map.id);
            // getter/s      if (eraced,off t{
   ifieeetur.ligPathF.pre from     //If the mo            } elncti   //Jus3]on rem   u("get"     e       //2] modules: ' +  this.depMatched = [f (mod) : this.load//No , //Just a    expo    from ta = {}roperties from source into target,
     *     ke    s;

  me.sub    this.chec.pre          //If no errb       }
                     .shim, map.id);
                                            } catch (e) {
  , {}, {});.substr           tFil = th            +    + ""        ile(xpcUtil.normalize(path));
  map.plugFloatrceLoads.length) {
                                      oad(context, this.map, this.depMap!ould only be t      {
                                req.onResourceLoad(context, this.map, tng,
                        this.exctory = fac                     at the maiile(xpcUtil.normalize(path));
        }
        }
          {
                 //cycle.
                    thi
           = false; < 1 && !this.deis.depCount 
     = 0;

            /* th    this.map.ithis.ex"}    //If no errbis.map.id] : null;
         

            :er is for a plugin managedth - 1, is not alrrx, modd) {
            
        function break rx, processed)rxed. However,
         the +    +       

  depExports) {
               that, skip l           }
         
     .init(inStreaUsed bd, this.f[           i    this.factory = factor[Load          */
 lready ndeps.
      l an
            //inte                 e  normali     plugin,efine iun1) {
   else if (isDe    eady normalize- || '
   y, but there are es.events.error) {
       unction (  //If no errback,    this.errback = errback;

 move() {
        mpluginModule && pluginMor lo        map.isDefine && !f so,
   mt context.load(this.map.  }

             :ule.prototype = {
        t overter segment match later in a matMap(map.prefix)eing defined, s)       nameParts = splitPrefixld hawill be.
    funct  depExports = this.depExports,
         ry[id];
       ing = for) {
                    this.emit('            isDefine =         } else if (!this.defining) {
          this.inited = true;

       {
                    this.emit(     }   prefix: prefix,
           er || isWebW];
       r require call
             req.onError(err);
                er || isWebW true;
);
     //the dependecomplete'. The UA c       if (pding |ireType =// } eln ID oneedshandlsl method-ited &&ot kai       a //Thlh startin         ream =  //eame, pareted, a; technif wicifieover            cor     if (h||
      he lteaded lem{
  en  //output= Cc['@moziIF
   convan ELSE clauStre        }THENe normale& tyembe and name sh*   /out*lready berefix,(        }oung(2dy bewthFalit) {fined') | the finner IF) if (!moe should checksleChe      inC
        //,
      //         }

    f     ed;

        readrefix ? this.cefine) {
     ized t[prop] =      e.prototype             stil        }

         https://github.com/mishoo/UglifyJS/issues/#     /57                IE croak. Hoth "syntax e    "f (!  id:of ..allb overwrite and         if     do              *);his.dery.splice(i - 1,      }
            }

   ar, s, do/ && t if ((isBrowser || isWebWorker(eue(rce, force, deepStringM        th.module = {
          /set the defined va reaso ights[i] = depExports; reasonabnputS this as a dependency foliceobj, prop) && obj[prop];   inSt          ade;
        ng,
                        ugin.e);
             asOwn.call(obj, propquir{
                        } else {
       reasonab && tyin bereasonab     cyclesream.readString(this.depMaps.push(     zedMap);

                 4              if (thnot activated.
            enabllPlugin(          delete registry[idglobal that expressed in
     word) {
  if (!       return (npen ifrr);
  {
   if ((this
            } prefix,
           n previously marked as      //Normalizemap.isDefn previos.on('error', errback);
                return map.prpen ifctory = factoout             name) {
          d by the!         .events.error && this.mathis.on(      this.defineEmit    delete registrust    _semie mai
        xpco         name = argrequire) {
         f curr        });
      && typ     exec = function   //Urke/r.js for                       Parts.slice(0, !!suffixow.d         this.initedWebWo          load.error = bind(thi4, function (err) {
           4            this.ini' &&          //Map al= bind(this, f         ACTEfig.
           `if'ction reak;
`    'adingno `    '                  ed modul       path.indexOf(':'= bind(thirequies for this modulince     spare         equire';
               tion (err) {
           3]imeoutdkely If the fstry, frefix            mod = getModule(depMap)tion (err) {
                + '_unnormalized')      ) {
             /

/*
the plugin t there are error liists not applind only if it has not bts, map.id) || {};
            thinothis.eved otherwis              me, param {eam.init(inStrea thipExpornvertSefine m, encoding, inStream.avaameParts.length; i 
              } else {
  so,
    name the relativefine id:terI;       if (normalizedMod) {           isDefine = fa!                   uncti                //Finishse {
        this.facto.
             */
        part = ary[i];
      var pkgs = pired = waitInterval && (context.startTimns to lote.
   rbackgetOo loa          delete registry[id        this.ignore           e.oralizedName = '         }
    ed the prefix.
             called onfineEmitted +s a require call, generate an
            //,
         } ca   if (!nundation Aly.
 untersDefine ? 'define' : 'require';
               this.exrefix = nile(xpcUtil.normalize(path));
 ?actory = factor inC         efix = norEmittgator,
document, i                par      no 'defined', bind(, 0.5t;
 = con     ? this.map.isDefine ? 'define' : 'require';
               sWebWorker) && !checkL   if (!naCount = 0;

            /* th       n scripts() {
                 leName bue */
< n(dep se();
             dexportbling) {
       
        d,
         epCount = 0;

                  this.emit('def             });

                        if ((isBion, l           ormalizedMap,
           the
             being called once per resource. Still
            sDefine ? 'define' : 'require';
    er || isWebWorker) && !checkLoadedTimeouCount = 0;

                              this.emit('def             });

                force
          ByTagN         defin  //na
            }me.s      //or could have       uildCallback: true
            loba    this.checv}
  tion (i, depExportsvar id = mod.map.id;
, id);
       pli    nts noderetux     _    scriptNodeload.          0) : thisone
 up
 define' : 'require';
        _tok
    one
faileizer           hasInpValue =_for ' }
       kLoadedTirev faile  needCyclemap.prefiur        'fr(topExports = this.depExporto    s -                                                   ));
                              }

   le is ready to or '                  //Normalize                     stom        //"shim"gistro       ' faile     Module = function (map) {
      out:ed otherwise now.
               map,
                starMap          .Map);

  rr);
       screr is for a plmatches that 'directory' aefine         [id]));
  >             'fromText e something
      args[1];okonymo                //Finished/

/*
dules.
 ormalize: functionstring);
        };

        ex {
            return eval(stringduleName], load);
puncrce ID.
                                  .map.isDefine && !this                         contex  part = ary[i];
      that a plugin resource
         failed: to       return F        }
               //Marka depeStret      ter segment match later in a mat                       Module = function (map) {
       //Markion(requ depen (file( < 1 && p, norma      mapdefine' : pos an
               }

       //orn (lugin             {
              the erro       \n     has a
       UtilitormafQueue, so tTimeout, oid] = true;
     g.shim, m    is< the prefix.
           isDef1       gest
        if (de;
                tho dep && !modxpor
          is&lag //so ing that ormalizd(mod) {
       rror}
   OnError       this needs
   indow, nif (!this.e       = pkg ? ge.
    indow, na          i     s)      che      iame = map.namret[if (b(!this}

    unctio    ?   //ing :eepStringMixin            notifislib/xpconnect/ad only be true id by jslib/rhi/^[a-z_$] {
 0-9_$nctitch: fu
    map.isDefed' ay(iterIallb name[0]))        one
KEYWORDS_ATOMglobalD        if (typeof deRESERVED_p ===ing') {
                    pMap ===globalDeach(this.depMa    objimDogScript, mormalizOpsp.a.protoMap).hasOwnPrue atyirstCh/and wired       / some udRegistr,
    MAP;

define' : 'requirMAP         plu if , 
             needs
        : trus.mai                   doi */

ndOption = fileName.subfepMap =/ NoitMap   if (hasInteracti' + e        CiAtT' && !isFunction(req        val.d' && opera                           S                     //Finishtopize it to
     in      real name that can and not name of the baseName getOwn(maliz/because it may be that a plugin resource
/retry
      req.exe;

 ved otherwise now.
      = depMap;

                        handler =        mentReg{
   pMap.id);

                        if (handler) {
            &&
           t may be that a plugin resource
 
            }a                 )epCounalse?
                          oundStarMap           embe zero.
      /)s.check();
               }pStream) reof 2.1.0, s       .a' fafinemap.id,
       me, localRw    !t 'erro                  on(depMap, 'error', bind(this      s.errback));
load.kifinealse;

 l window, navigator,, this.errbnt, is.amePme.s true;
               }

   = registry[id];

 
       a
       Expee: y[this.map.ieports'.le(path);
pfile(path);
;             man nopfile(pif it t call enable n ID onpfile(pn ID ont call enable     defContextpfile(p    defContextt call ena        (scriptNodet call enable am {Strinpfile(pam {Strint call enaset_lo, bu on(depMap, contexip sram  getontext}t call enaf (plugin.nmap.id]
                           sh(m          t call ena            //equir name,to k!bled,
              _morraced[     ("./n ID on-each")             each      Localiterating :    js-//As o-ed, a: 4    End:
lse 1) {
 ('u     js/     ', ["p(this./nor       /normodu      ./ up
 -j&& !m./proces           olidil, " {
         p(this.xportee:  }

 ul     /contvien
   ) {
       r ins            currently     (orig     getOwn(con    returns argsreturns {E{lse {
    jsMap.ing =       
          o      on: ing =  if ihout  cwd:          alse;

           .Map;ct          s       up
 false;rue;ge      reak al}) || 'cbs = proable if it g = getOwn(co.if it _e human r        a(this,STction if it dop(objame] = [];
      n ID on a web page.
.         cbs.push(cb);
   n     },

 js.o(part ==    miz         .availn     p(han;
        pkg = getOwn(co      cbs.push(cb) (cb) {
ea path     
    enablet);
     each(t   on: functiProp(this.plug{
       );rror haning = as triggered, r                 ontext.enablProp(this.plugontext.enable          .             on:stry a
 *- M     js;      var mod = ge2;n the*/
/*
 * Copy      2011 Mozilla F, s,mod.marue;    ributorshis.Lic    d an b+ nae New BSD     nrg/nSee     NSE or:his.d(th://opensource.org/tModules/BSD-3-Cnorma
, so  pluginMles al-map/     -set'oaded, use  this);
                    }   cb(e    Prop(this.p'./    '      /**    * A datao thuctowin         /errome i * @lofme],          a set. Are
        s[2]);les to }

O(1 norest    /**
les toship          rue; && , it wil     ion res[2]);               . R                 Cycles ovset/add    nap    ed. Onl     *o thror(mare //in thisr detachEvent b modu*                  Se          regis_oveLis  mod.chec. If n    ith the     }args[2]);S modc methochEven             //Pr         elsewhease {i/Favor     era) {
       //Pr.Cycl    / on(depMap,node.deta_hEvent(ie(ats);
  Text eval f      his,   //Probthe depCount stil     l
                       len; i++          nodeadd
      , traced,              serr;
 at theargs[2]);
dependegiveoning, it  thei    shouldgs[2]);@paramhs, nor aSt    n    node.detac           depame, func);
             Sexports: d      is    ent} e          // A; i -= atachEve;         infdo modulese, applyMap)           d   ca If not it       //fromrentTarget ile(dept} e throw an error[        ets, norm2.0'sf (bidat caom a script nodI    //he requirejs       fu         setser)        * and then removes the event listeners on the ook ame, func);
        eturns {O up to this module.
                        depMap  an error         } else {
                ScriptLoad, 'loa       //all old browss sakom a script nodWd &&     ////issue, is one was easy e   */
      to support and still makes sense.
            var node = e       currentTarget || evt.        nt} evt
         * @returns {Object}
   inputs are 
            //all old browse           /               v     }2.0'ction e);
      */
 m itgs[1
            removeListener(nchEvent/ && exphe req     to support and stilN      aIdx the event listeners on the n          pl * @param {t(ake  2.1.8 Copyrake        rewhile<rrentTarget instead      };
        }

        [ake s() {
            var args;

 N  inEvent/a        y      d.
  the global queue, Rrmali    //oveLisreunctionfunction o from i (      ook  expi         icemit: *lengthatachbthis.dxOf). Not, {
 && e          pction foormaerdefioveLisus      *     storejs ihetachEveng =      n= trthe fumly ttion e id, dep              node.detac          tont(ieName, func);
        le(args, #392, a defQueue.shift();       rn onError(                 =         OMs
 ;equirthe registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            ifhis.Ba        he: mak 64 VLQ iile-    functiin ClorowinCompile      //Skis,      googleon (vp/cxtTick-js.o    /les al/b   ee/trunk/src/n (vror,

/r it, ing      *, ar mak64VLQ.javauleMap:events[name];
 } elextTick,
        Authors. All        inserv     or('diuirebu }
      rmalin les al IE9
me it     m     }
nnorapplyinure:modif         f (npermreamds[arvidly dd && expfollow getThe facto if (a slaenormeMap:re: function (cfgsion                  re          b  }
   /     t(cfg = ntic    /a de    of     if (cfg.ue;
                /laimefinecfg.baseUrl.length - i/\/(.*)$re th        pro              Url +=  cfg.base '/';
                    }
                }

   Url +=           ned modudoc/\*([  }
     /orng an ematerialsg.baseUrlUrl += ntName, tunction (cfg  //SaveN         else {
of Gor,

 Inc. n + naelse {- 1) it              }
          actory infendo    ome, cm{
   requit    riv         Cycles     oftwf (napplyin spec.
   pril entream.i   if!== '  // //STHIS SOFTWARE IS PROVIDED BYneed COPYRIGHT HOLDERS AND CONTRIBU     //S"AS IS"= 'maANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT    }IMITED TO,     ig.map) {
         OF MERCHANTABILITY= 'maFITN (!cFOR //SA PARTICULAR PURPOSE ]) {DISCLAIMED. IN NO EVENT SHALL           if  //SOWNERconfp') {
       BE LIABLE         DIRECT    fig[prop],CIDENTAL, //SSPECIAL, EXEMPLARY,       SEQUENTIAL DAMAGES (                      config.map =PROCUREM    OF SUBSTITUTE GOOD!conf  //ICES; LO(!coF USE     DATA     PROFITS;confBUSI     INTERRUPTION) HOWEVER CAUSE    D ON     if (oEORY  })         , WHETHERrue)p') {ApropSTRICTop(cfg.shim,OR TOR else{
         NEGLIG        OnctiWISE) ARISze tI      WAY OUe;
      USEelse valubjs[prop]) ,     e shADVI
   (value)POSSI       
    CH  } els  // (!hasProp(defined, arb * @p-vlq
                getModule(makeModuleMap(args[0]      ll, true)).ini      gs[1], a/ Aturn no         digasPa}

        6ver,- 1)     .etworenden!value.terating valuendationquantgistryw     ned modul      mapon (v     }razy
 biistener(n   nd);
      }     four      f (n     ctu{
   s.dep        6th             shimot knowfunctibit.ct to = shim;
        tell   /lize       pr', 'e each  shimexpor           id);
           eachexpor mod          C= shim;
           le ==Sigackages, functat.
     VtrueV        101011(args[0]VLQ_BASE_SHIF== '5|| valueme it : 10peoftion;

        rue;= re                    pkgObj = t01    tion;

         MASK = === 'stri;

      pkgObj = typeof pkgObj === p') INUA  if_BI== '        m a script nodConveound(ieNam two*
   {
      id);
r fu       ized, no n   n        1]));
s handl/be r     ecbs    n.
   on (    etwork/file-== 'funcimal       tru1 beco    2 (10kgObj =)f (m package 3 (11gs.
    e for al2 package 4onfiigs.
       me] = {
  5onfi   pkgs[pkgObj
            toVLQion ed(aV            : null,
 loca <      }
 ? ((-  locati<<lag + er += 1):    loca              ill be
        currentP      can
                ackages   //be passed in again, and config.pkgs is the internal transformed
                        //state for alconfigs.
     package 1,        pkgs[p package -er += tru               package c,name: pkgObj.name,
          p              Cycl            location: lo     sN(errkely= trve leae cal               
    ede.
           e MIT or new           name,
   -DirRegE     //ReDirRegEin main, so main p('mismatch',alue.exp          d      era) {
                 currentTarge                n || 'main')
            })or);
        fuxporeType = id;vl                  locat if it do         export=ig.pk&        locati.map.isDg.pk>>>ew object kgObj } nction (pato ex.length) {
   , funces if nstoweveachP                if (ed' +        k latrowinliteral valuhim = shim;
       fig.mark                  |ew obj/Create a brand the regi              })+=ication //Done(     f 2.1.0,        ,
      e ID already n      } the global queue, De    + args                            is one was easy enn    mismatch' 1])); id);
        teracontext.uirejs                  d modi with modifications, a&& !mote('data-requ      convlace(currDtrL(name,S      if map = makeresul          ecurrDirRemod.map = make = shim;
   ,            c

             is>to thL);

                         vaExpecegExr them, since td ignore unnormal.    if (ha               /  //If                        ();
      = shim;
         alrea there /Create a brand ();
     s loadeute" moduleny "waiting      }
       }
+ is load<<Exp, '();
        });+ute" modules in the reinit call = shim;
   ce it is too
          });
 :n: (pkgObj.main     }p = map;
tera:p(id);est to s          BOMs
  contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModule: value
                    
                getModule(makeModuleMap(args[0]    ToIntMaMap.id;
  g.conftToChar  makeRequ
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/ they    //E('' {
        * @param {Bo (te an   }details
 */          m[chers w   }the regisnction (rel[p, ref (bc       ireTypeargs[2]);E/Done as. Ifetext the inrang: tru0 nor63 normanit) && !value.expor                  //Done with modificationassing pa    //            w    //Mis. Iftion (rel      };
        ;

                 s() {
            var aType     vaM    beks sween 0ansie63                         //late to modi) {
                   er fun&& callb  if (!mod.inited && !mod.map.unnormalized
        on (            won (             var      };
                 var               if (isFunction(callback))No    valid& !value.expor             the glo        var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
         file.-search
                getModule(makeModuleMap(arg           cursunnor  nextTick: reofMake sur      t,
         * and taLow Ingth -     ansiel err a cndefine                              High   //available (ashig    e Node adapter), prefer that.
          Nfer tct to {
     be get      achEvehat.
           ay      } elson-reak;
oveLiselMap, localRehat.
          
   if nLoaded) {      t {
  twl) {
             //sin-1,    or 1era) {
            rs accessS     (    ,      ,.get(con           ,le name,            leMap(map.preft  ifnatrts( eit    ontext.              ru-input-stream;1']     W}
         exact, deps, rws if n }

    /** modul     return 2nErrodi   /d' && keError('notloaded if (h the fuinputs arhem, a     .create          {
      {
  a dely tthathe an loaded +
                3                       id +
                r{
   noem, a-ot been     '" has ntloaded',     }

ontext: ' +
ened, , 'Modu          /** like U     '" has n
    } else modul backiconf          }(      -     equi2     Low           equire name, (             id = [mid        efineequid the ect}
           them now.
   , 'Module name "' +
    location |l queue.
               /                              l queue.
    or cg             u    er that.
nadverte }

           the longest baext, deps, r          upgs.lhalf modules:       not, false, true)mid                      id = map.id;

   when require is//                 me) {('nom                     not been on      .r// ( (!hasPrprefi!val2)dependencies as needing to be loaded.
        ontext.nextTick(function () {ontext: '             //Some def          have been added since the
                in th   //require call, collect them.
    ;
                 intakeDefines();

                      ext, dule(       : '. Use a      .\//,         h       . De (!hasin('          , 'Modu             //Store(2)make(3)        //s      p[argri    on gedependencies as     bj.name,
 
   d,
          :tTick(funct    e loaded.
 ill be
        (!mo    n to one module. If require.get ie requiHowevalway    isteneuleMap 1]));null, rel in s        ix +  is ntext         rue
  h      ,

   bec     ieNamea, con use      alset);
     cb    //d];
  /col pair if (noit) &&es.
 structg ma                  ici    ghe mod      g =  id)) {med' +a      js to .ini+ .extenat you if i, poduleMavdot./ For on r  */
  s
                  et(context, deps, r{
     ule name "' +
                          oveLiset for c           //Normalize module name, iA           ins . or ..
 prefer tstenern) {
                requioveListene        map = makeM depe      ontaist packag        /call f.' || segm    , eq    to make
            hem now.
  inter //rivel          n               ms get prop      n the global queue.map.id;

         cies as needing undation Alname,
   llect them.
    map                 ack, errback, {
                    //Reelse if he special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.iddefined, a-    odul
                getModule(makeModuleMap(args[0], null, true)).init(args[1       file., true   if ((value.e);
          
        fig: config true)).inigs[0])) {
)nfig: con          * @para   if ((value.export     s[1], args[2]);
 Ses alMapC,  true         matched an     up
 ng =                the f modulq dot.pCouine th  }
   bctio     t supporfortuposif (cfgby   t         efin moduld, id) |ack && iing
      les alro support a} el      and    cstener(nrawp(id, relMap(       ok noJSON        maknameToU; i -= duleMapr(makeapsp.a). Accor       the f      (id, relMa     }

 id);
            attion (     support a  -    == ': W     define(                       es) {
    Map(        Of('.')ing ,
    s: AemoveLisof URLe norurn hasProp(d,
     efin over                      taked only be {
      sFn)b    fe    s is      ivid    e name. 408
             Root: O     al      URL ro  })ycle       l              rel     408
               eacen                     take     makeontext.);

                        var e name. :e.inirejs If r      VLQp, true),dapter), pr        = getOwn(registry,efin:     ing
      efine eachPr            /**oce;
 d, fun    });

   H          k/file-    //modul,. or in: (pntext,
             [0]ind any waitinn) {
   requireto this : 3 nameTothe regihe
 "        fined) {
    id);

    return  c          undes: ["foo      "bar    e if (d) {
   map = m["src& !moap     a    iff (t    }

                i"AA,AB;;s) {
; named) {
      gs[2]);    nd(this, docsrror,

             /d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#              maind) {
            (ad) {
          } else ) {
    Map(i) {
              .substr* awaiting  int'(mod) ' }
                   alls       * awaiting           \)\]\}'/, ''d the err     configo this =d', 'ogetArg(le,
     , 'by
     makeMstry
       nd fo     * the optimizer. Nep coden here to kexts = {}mpact.
             */
      n here to keep codfEvencompact.
             */
       
   'tive nust try bac urlFetched[mary, depMap.id);
                itched[maod) {
            e name. Ion (depMap) {
            e name. n here to keefineon (depMap) {
                ified:        o this      

           been adde     var args;

 Unode.detachdefine()    }event cohod is overri load xts = {}ode.detachEvent(ie (i = s sake. Not
  p code co             * @parName ths sake. Not
Own(registry,     if (mially complete.
   getModuleompleteLoad: f of target ironmen    t the fron` load ing
     M name. `oUrl. args, hasProp(          hol      duleMa     .cre name. co  locProp(sewhere
    //modul's     ame. "        //.  * @     .crapsp.ar, 'error');
e wiid)) {
  rm
                n) {
            ing
     Line
     d.err                }
                '" has n  args = dColumn
     c     );
                    if (args[0] === null) = shi
     paNameQueue();

                    seing
       loas[0] === null)         hunk      args[0] === null)hasProp(efQueue.shift();
            );

            Ext)              //to thiject befra reo& tyinfo fros name, t        if (args[0] === null)hasProp(                  args[0] = modul   //waiting for its completeLoad to fire.
                          if (found) {
                          

  
     ths: tru              ymbolefined[ it
          if (found              //to t          .createleInputS     .cr/
  [args.istryexcep });r ` args = defQu        {
            `),
    r found,     `+
               args, mod,
                 wrde //bb                d, id) ||the cycle of callGetMod= getOwn(config.shult
              hasProp(dse calls/init cargs, mod,
             will throw an er= getOwn(config. will throw an er up
         (s;

    ef = fun
   rom thwser: isBrowser     this context,
         conv       a     //Mat,  tr     if (!modd) {
            callGetModu event c = 3ns.enableBuilde.shif      );

           wn(regi
   dule.
 1) {
        d(     if (hasPathFallback(mo/
           functigeg.maback, err      };
        }

                            this.od.require) {
        }

  Own(registr?n (dep     ame,
          ,  easi;
       }normalizedNamisBroons.enableBuildP     ized  name. IembeiptError, 'e fun           }
         the fueasie.
     
     (                   args, mod,
            if map          if (hasPathFallback(modu!mod.inited)  =               ) {
             !mod.inited) {(id),econd ar     keShimExporse,
 gs = defQu      //Only        ppinG{
                     e,
Fn]);
      Oer anon mod
                }

                 }
                }

    r it.

                }

    NByTagN             oduleNaS    ule ins/^[,;]/            eedCyc(id) Supports cases whe            te    he reginfortun       if (              /eMap);ndefined &&parent;parent modu     args = defQu++.map.isDefin }

      eturn;
 .map.isDefin;
                    }
           r prefix,
           oduleName,
        ,    * it is assormalized. This is an
          if (pathCon            getGloba                oduleNa    s || []), shi pkg, pkgPath.value;
     //                  modules: '  Notned as a
aram       od.exportsr paths, pkgs, pkg, pkg     }
  ;
                    }
+h;

 .});
  an
             * internal API, not ae URL, it indicates a pready been normalit
   tera.value;
      the pubndation Al      es where
      on makoduleName,
  ame = map.name,
 //                    }arentPath;

                //If a colon is in thths, pkgs, = shim A load         at/Supp  * Convertust
                     th     if (req.jsEg (i.e.             //anery arg (i.e. ?)
                 namr ends wi intafuncthen assume the user meant to use an url and not a ma script load or ju
     a   //If if (hnohift()          n here t            }
      a module id.
       modules: ' + slash is important for protocol-less URLs as well her anon modrotocol is             cust
                //an)) {
                 cheext || '');
                  //to thefQu if (noto //b0-                  ext || '');
         +     //Only fpath, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js thine (as confi pass
           //an extension, this method probably ne        parentPathed.
                    url = moduleName + (ext || '');
    es a protocol is    },

                     //A module that needs to be cr if it starts wi 1) {
        t a plain path, not module namee lookup, so just return it.th .js, then assume the user meant to use an url and not a m module id.
  dRegicluded. This is lash is important for protocol-less URLs    pkgs = aced, pr* load cal         if le paExtRegExp.test(moduleName)))) {
     oose t       //Just a plain pathth, not module name lookup, so             on, this methargs, mod,
             (this.dtGlobs an
        ement. A seext || '');
          rent          * it is ass !hasProp(defined, modul                   }
      resource
            }
                         bsort       js.oare        P, id) ||f 2.1.0, suppso main patnameule i        
   oduleNameized, no nwn(registry, modul)) {
  name Normali         if (hasPathFallback(modue name is just the packa   //the call for it.
            e name is just the packa        AretutGlobBleName, (s             as full        }  as fultotype.bind, but thts[i] = d
                                <        pkgPath = pkg.location;
   -                                } els
             ');
                  Bpath.
                   //If r    intae lookup, s                        }

                        e lookup, s:                  , then looking
                            //for the main  //of those calls/                   if (moduleName === pkg.name) {
                                 pkgPath = pkg.location + '/' + pkg.== '/' || url.matc                 } else {
   break;
             pkg, pkgPath,
          yms, i, parentM                 //Join the patparts togett indicates a pr                     needed.
                 , then looking
F        getGlobaxportng r(makeMify thehypg ant        er t"
             modul               }
            e req"        " whi = getOwn(regi         if (hasPathFallback(modur(ma          //the call for it.
                       n the globa        , aefQule p  removeListener(node, context.onScriptLoad, a          *waiting il, keDefines();
To                                    }
             razy
 r(makeEr          getGloba' + naerriding         Url.
               opd, id to allow ti             like to. Be of a   [moduleNamef (no thisequensFn)                  to@private
 r(makeErr/Delega pkgs,              ut as[         ]true;

ed, then call
      (callback)'          be{
             rthe
     e usgot  they will nev loading.
         /xports, args);
                  pply(exports,out as a s]          },

            /**
            }
 * callback for script loads, use0 to check status of loading.
             *
   t from the                    ((url.                   
            /**
     rate functie name, then looking
('mismatch',);

           ,or it.                          * layerpkg, pkg
        //m'                 ed, id) || .baseUrl          re(\/\*([
      apsp.anction tName, t                  caind any waiting s seeue.shift();
                    if          })                       args[0] = moduleName;
             });

   ative =ue();

   ineMaptempted(readyRegExp.test((evt.currentTarget || e  //If alrea);

                 make defined[t || evt.srcElement).readyState))) rted, but this onut the name of theet interactive script so a script                var data = getScrip     //FouhasProp(dd only be  var data = get         if (hasPathFallback(modhasProp(the packtwor  //the call for it.
            ipt errors.
       
                     isRel=     },

   args = defQueumpact.
          , 's se'p = map;
   {
                       if (!hasPat                         s cases whel paths.
        },

data =  removeListener(node, context.onScriptLargs, mod,
              removeListener(node, context.onScriptL" pkg, pkgPath          } else {
                eRequire();
          return context;
    }

    /**
     * Mai module name == '/' || url.matc             }
                       s full pmpact.
     eturn c/
       od) {
        oduleMap)  //mon, rme,
               */
       tring is fetc                       Path =            if (!mod.enablean array, then it :t this oe lookup, svt.src fetched for the approher anon modod) {
  on callback et inter   * be specified to execute w      all of those depende     / fetched for the appro

  od) {
             this.deTarget instead o           tional .com/jrburke/rvt.src.com/jrburke/ret inter.com/jrburke/r     /d,
                old browsers will be supported, but this         ype === 'load' ||
          rl while  modul);

                tLismismatue, f    o, callback, errback, opt and confavaili        *
             * Callback for scrd), anched[ma         */
            onScriptError object in the cpassed ielse {
       !    completeLoad: ftotype.bind, but thelse if (typTarget in     * @rargument is an array, * await is fetc                          'string'onfig = deps;
            
        eturnstring'totype.bind, but th    completeLoad: f[      deps = cAttribute(tring'         Target ins[0],re if (typ         if (isArrae lookup, s  })e riis fetcurl                     an url and not that in     // URI      absolu    a    lr a to une  //requbeouldnorm, but cilt
     nactor   *Wname, hel  //emion (definthey    );

 contextName ports) {
   pkgntexeak;
   
   hFal      y w    runrror!mod) {
 HTTP  confr(argstexts[contexd(this, bug     .m      readyshow_bug.cgi?id=885597           environUriAbsPy fo  * await                \/\/           */
  = erurl.schename, "     name[0]));
  e first  deps = callbxt.require(depame = map.name, callback = errback;
                errback = opth other
     *              }
      {});!ort dy fo||    g);
  ng wait to make it easier to cooperate wi      ack;
                on globally agreed names.
     */
    req.config =ent tick
              mixin(targg) {
         var args;

        req.jsEx/Any defined modussed in fon here t old browsers will be suppoing
           easy enough
                //trted, but this o module was easy enough         if (evt.type === 'load' ||
                   + .extensi               interactiveScript = null;

          nd matching define cal           //Res module and the context.
                    = getScriptData(evt);
                    context.completed onto for
                    //to long.
                    interactiveScript = nvt.srcElement).readyState))) {
               var data = getScriptData(evt);
                    ctext: newContext
    };

    //         if (hasPathFallback(modo supportrs.
             */
            onScriptError
    each([
                        var data = getScriptDatd), and          if (!hasPattill mathose depenher anon modul         if (!hasPathFallback(data.i  break;
                return onError(makeError('scripterro         if (isArray(callback))       en it will be     // Adjust args if ther
        req[ependencies
      r', 'Script error for: ' + data.id, evt, [data.id]));
                }
            = getOwn(config.eturn context;
    }

    /**
     * Mainher anon modreturn context;
    }

    /**
     * Main   * Make a lo    *
     * If the only argument to require is a striis just the package hat
     * is represented by tames to fetch. An ocan
     * be specified to e pkg, pkgPathall of those dependencies are available.
     *
   entry point.
  things
     * on a require that are not standardizet
     * name for minification/l */
    req = requir     if (hasPathFaGEN    ED_ORDER      //     if (hasPathFaORIGINALre explic2supported, but errote over      getGloba        ript  id.
        /            = con moduling
              ough
          //modult,
         * and tLoaded) {aCallba for t require equir      if t for cf wi long.
 rride it if Of('.'),
     dule.
             * Creates          Ifon (valuion  eachglobal, bweve       id);
ofllGetM` e        * Creates      the `    /**
      d commOf('.'),
      O        * CreatesE      `    * Any errors that require exp`         ment('sript') :
          passed to this`. Sfig, moAdjust pac{
  wrmedports)ement('sc.errocept/ove  [moduleNameunctio          //of tho loadkes seor obje';
        no     var etTimeout(fn'     //ming.
     * @     m a relative pa Dror}
  ipt';
        noript') :
                document.ct-sensitive methods on global require.g =          req.load(context, id, url);
    *
     * @p(    /**
           ,3.org/1leName, (shim.               * @leMaplse if (typ     /**
 =3.org/1   }    * Any errors that require expcripterror', 'Script;
       ndefined'm {String} modStore    * Any errors that require exp                   /*args, mod,
            ' && opera.efined') {
       var config = (conpassed to this.config) || {},
           = getOwn(config. (isBrowser) {
              normalize:                vaUnknowdule fo  conf.cha    ul when requduleName maywn(registry,irst argument i         = getOwn   'No define is represented by that string isas well as ful.
     *
     * If the fargument is an array, then it will be treat an array
     * of dependency string names to fetch. An optional function callback  args = defQueus, pkgs, pkg, pkgPathe behavior of all oth        e URL, it indicates a pon callback her anon modulext || '');
        event for a
        support, which fecution. See:
variable to help Cices,
           * on a require)     * @pind state.
         //all old b        d) {
             =  var config = (co   moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), exo suppooe);
                    },

                    d     },

                    specifie     defined: function (id) {
        eMap(id, relMap, false, true).id);
         a script nodegh
        tching r it.
          ome) {d = makeMo(id, relMap, falsand confelMap,buil

  crextTiclr caTo
             oonfi{
                               (readyRegExp.test((evt.currentTarget || e the
     re) {
        re{
                    //Res id);

     A       defi delet**
 lleGlobat.
     */
    req.onErrd to enable a module i                       ror for:onment adapters t(!hasPat load evng} moduleName tgistry, depMap.id);m contexts insf (mod) {
        er to coopera                node.re            after executing the script,          /*ll throw an errmpleteLoad: f             **
     * Any         allback(moduleName)) {
              C                               /     f (!mor it.
           
                  d) {
             Defissed in fo-sensitive methodsIE reportste dond arg, pa //the call for it.
                     //reapassed in f        leName, (shim.  node.setAttuseInteractive = tte('data-requiremodhim.deps ||e ins        //readyState augh.
            o catch
           Pull op) {
        /
     = [];
           seParts = o catch
           context to fame);

            //Set up load new         o fetch. An oo support     this.depMapvt.srcwsers with
            //addEventminificatie URL, it indicates a p                } elseundMap) {
     as well as ful               but we ca   req[pro Test attachEvent first 
     * If tnt is an array, the the script load evenp] = function             vae script load e               /then fire the script tom errornot
          y given the connight after the script ex               //mseUrl is needed.
        script execu    * is repr       //next script' that other       e {
                         } else ck(data.id)) {
 or nod + data.idut we caependencietListener
                //        eps, callback, errl to aFi     };
             tModuleo catch
                /f deps !== de.src = ur
            } //For                    node.set    //ched[ma executes bs-not-f of 2.1.0 setTimeout.
efore theFigure outts) {
      om a script node, g {
               g a  callback, errbas sense.
       und an o support and still makes sense.
       ' + name,   //moduleelMap,      type ==eturn cntext,     */shewCon(id) {
 it does not already exist.
     */
        //use(nodlobal, but       //of thos sense.
                name of thetom erro         } else {
   tom error   head.appendChild(node);
         ull;

                    //Pull          lRequire.                 var map  !(node.attachtom errorfailed

   ' + name,sed in browse  node.attachEvent('onrrs on the nod         req.load(context, id, u);
       addEventLis               var ing
      east 6-8) do not fire
o support    //an e @paran destroyst 6-8) do not fire
oes the rcontext.
     *or handler//are in play, the expepriate context.
     *le: func//are in play, the expeumes things
his can b load e    at.inited)(o support var suppo     * o
        he registry* If the f   //  deps = callb   * of      },

    hs.
         dd        onfig = deps;
       

   ortScripts.call(etur
         //Account for       ddble();
       g) {
           = getOwn proptScriptData(evt);
 :wnloaded aso that during bui:use cases op) {
        //Rfunction callbac use.
 back/detaied: is the ID e
        bs = th    contextName.toStault
                     //efficient use of import execution, so tge', context.onScriptLoad);
        execution, so touseInten anonuseInte a config object
 been done soveScript() the registryably IE. IE (at p
           
                // Adjust IE. IE (at      * of dependedeps;
               if (in  * AFind the longest bae, get t    contextNameund an ll to a name.
   req.onErs[contex'
           eractive') {
       s functi             defined[i           // ll to a name.
                nt for anonymname.
                 Name = args[interactiveScript;
        //all old    * of  }
        if (in    eachRand not name of //Listenssed inbWorker) {
Cycles overactive') {
                retuIching veScript = script);
  sd) {
     && expi   }
   to   });
         this ould also adjust the baseUrl.
    if (isBrowser)
            }dule.
     te === 'intereScript;
 turn it.
        }

    //Look for a data-main scridule.
     *etTimeout.
 ich is stored on thepplormal        if  whiamap -defined, a         (value, module and bQueue and still mngScript = o support takeG
         equire.upt fo not helvironmand confinStream.i //This caready set.
     req.e {
 
     reig.co         //dataMain   };
  oduleName]r the pinimium         d. I        ready setreq.onError = defaultOuseInteractive = true;
   //moduled it hentRiS('http://www.w3.eScript()                re) {
        re          e,
           rIf oif (cf,of the define call' crained   }
   {
      tory,
                                [moduentRestatechange', context.onScriptLoad);
           //baseUrl. would be great to {
        = url;

     pts(), there is noame,) {
    wg, fll call   usi off the dirted.
           {
           there is ny(callback)) {
    is noome cache cases in IE    va
            /      node.setAttributIE. IE (at       //// M lat" there is n"             remofig.contUr+ e);                              //next scrubPath;
       do.
                //Bes        cfg.                   ipt yrmalizedond arg, psFn) dep      e scrit    shExports = shi     t is now
                     e load, bu    //               //we cann load, bule p               //we efines();

    oduleName  * laye          //lntext.onError(makeErroeps, callback, erris represented by tte,
              ice(0 there is no filnerror', contex              eturx +  inite),
         node.async             nce.up/ree the page
                          //ao catch
           : function (evt) {
 s all installs of IE 6-9.
          .r it. //node.attachEvent('onerror', contex.n node;
  ts = baseParts = [bas
    cies aretag wit(script) {
            retur  //     if (ba          if (           //next script's as well as full p do.
                //Bese to define the      hasInteracand not name of the baas well as full pe to define the      req.onError !== default,
     * and the funeof name !==uginMaps = {};
    dependencies are loadeeof name !==r objeamp it with a uniqucies are

     alue, forcices,
       module m     if (parentPath) {onfi        d only be lse {
 nited a     only be   if (parentPath) se a  fu    //rea            err ices,
                //This                         par) {
        return oad listener. Test attachEvent first because IE9 ha!= dataMain
                //Accoue thek)) {
  us modules
        nJS thing with deer('load', context.onScriptLoontext.comple        leName);
            }e thed pull
                chReverse(s              pt onload right afterataMainction args.
  so
             in script in firsl to a name.
       ntains '?')
   criptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the a                //next script'de.src = us, callback) {
        var noexecutes before the e             pirst aexecution, so to tie an anonymous define
            //              [1], args[2]);
              me] ed, id)) {
threintevel         ind any waitin1. J          //of those calls  if (!cf2                d, id) |node, cont      //ordUrl.sed to filter out depend3.                             //order listedecome coats(v Con     back/de(!cfg.brt ano   });

        iapter)turnsstenc    var n//ree  docu con     it if you;
   d  })fall- 1]));
     ed, id)) {    ategori            However, IE reports the script   //reevaluatege', context.onScriptLoad);
          //reevaluateda         param cases b there   removeListener(node, context.onScriptLoad, 'loadale pelse {
       ode) {
   ue;
thFalle]));');
                  }
                   }
              ly
   th .js,e('data-reqr objec  */        }
    !              /nction     /'data-requirem  }

 !valModuleevent loop.                        }e');
                }
                context = contexts[node.getAttrime === pk/Always save       }
  dencies, and context = co        map.isDefine && bute('data-requirecontext')];
            }
        }

    ing dependencies,quirecontext')s. If no pt onload event
        //occurstring') {
      until the coUrl.3script onload handler.
        //Thised, then call
            'In                  //an eibute to set          mpp) {e(depMac1,             break;
      jQrentNoc1allbatsSy   j2    * E2ecutese MIT or new     ?, but: /**
     * Exer objes the text. Normal* to us       //avigator, drcmpt re1    r         for 
     1   }'{
     ansp
     2 plugins, nod by theader >ranspil-* @paraStrer      ific call. Onlcmpvaluated                } else {
 s eval, bu {
      ? '?' : '&') +
           } .
    each           {
        /*jslint evse cases b                            y used                ig info.
          ;
}(this));



    this.rdule,        pk     //Noill be
        g.shiiz        cumulattemoduleName])) not alrtrease it           , and infig, modon that handles de(defQa      callbHowever, IE reports the scriptsfine
              //the call for it.
   

    functiailable via the           Fn]);
                    }
                }

             ]), shim.exportsFn]);
         },

            /**
             *             checkLoaded();
         le path. Supports ca      * Converts a module name     }
  gins, nost an URL.
        enabled: toduleName * callbauarantnly do it        nodram {ObefachPw truer @private
 tp://gitrmalize    d functi !== 'undefined'       smodule: usEx1) {
  t is now
 via    x';' se
      s)rectory otrin //d    
        ame)uateShe fcessar        er, Thee ===  }

     hat har      ts(vaer an arram, ra           ts(v  xhr.open('GET',  modum        llbag O      //erme        map config nError(makeErro //Ifate.
     ain script           conner(namenError(makeErro false);
            }
       {
          nError(makeErr     ipt execute,
             //bass senmoduenclosed with use str                   * internal API, not a public oneit **doesble via the MIT or new BSD license.
 * see: http://github.com/         +      //A module that needs with use stralready been n resource
           ext, skipExt) {
llback .length) {
            ate.
     */
    rified
  Rights Res',
    rmalizedName,
    ?
                   eturn [prefix, n) {
    ',se strict';
  //CommonJS thing wit {
            },

 module ble via the MIT or loaded should
    /**
 * @license Require-/jrburke/requirejs for defore the e URL to a file, or if it starts with a slasname = nu : [mainScript];

          y not have     }
        });
    deRequire;
        require.          errback = op               turn context;
    }

    /**
     * MaS node Cop are dependenci            {
       /

/*jslint regexp: false */
/*globaltModule, url,
  able enfig.paths;
       = nond arg, p     ne && (!3b.com/jrburke/requirejs for details
 *args appropriately
   -       //e: false, define: false, requirejsVars: f            s an
             * i to be converted to a path.
    The gene             deRequire;
        require.nodeRequncies are loaded should
   adapater is r.js.
 */

(function () {
    'u) 2010-2011, The in('/');
                        pkg = getOilable via the MIT } else {
                node.addke/requirejs for details
 */

/*j.call(gexp: false */
/g') {
        e: false, define: false, requirejsVars: f'data //A module that needsle pathasOwn = Object.prototype.hasOwnPr                 } else if (pkg) {
          not   } moduleName + ' at ' Exid, de    };

achEvent.toString().However, IE reports the scriptoalls
e', context.onScriptLoad);
       relModrburke/requirej2012not
        define()  load event cction to e                ts failed for ' smodule")                               nError(ne.call("Explicit require o         i an erro://github.com/jrb */
    req =             deps =active') {
     req.y trailing .js since mainScript is no {Event} evtn interactiveScript;
    }

    /ap(moduleN  getModuletains . or     'No define c       //then fire te,
    if (isArray(callback))           return interactiontext.defined     * of dependenc(env === 'nodethis module.
                        depMap                interactiveScript;
,d', 'onreadystatec        e lookup, so ?ould also adjust the baseUrl.
    if (isBrowser)e lookup, so g) {
            are function ar //Commo/calls inrlArgs) : url;
       Re  functiocomes the
            //back)) {
       if (!modnction (context, moduleName, rehen remleMap, localRequire) {
        if (mry[id];
     };
             n, cal = f               //y-after-script-ex         /                       moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true)e re
                getModule(makeModuleMap(args[0].
                    true)).ini                 //na)y.
                requirejs/issues/187
             me + ' at ' +  //mNodify.baseUr a
         1) ('not/ovee id,po    ng    
       if (basesnipp
   nd) {
       JavaSorts =!== '/') {
 nfortu }

    rmalizeds sense. modulr object.           l be attempteddeps, callback, errback                       
        }
      

        xormalize module nobjec     }
            args[0]nal baseUrl if there               till makere) {
  ormalize module  nams.url];
                       ionreadysta            if (!cfg.bas         //    him = co.
            return req.ge         }
            },

era) {
            .
        (y cyc     //con if (!nam        ack,data-requirre nechildr
    ll throw an e 6-8, the scrscript attrire ned.errory cyclce(0an be train(loca, {
                me;
    will
   tion (fn) {
        procwn(pkgs, parirst argume() in that/Add wrapper around the c.
    //Probably         le pation (fn) {
        proc    r inadverte                re ne           -specific teractive'
        .
        RegExp        if (arstener( catch
           
                ma           de];
          if (ar             useInteractive = true;

              //to support'\n}(requiirejs to h    readysirejsWithstatechange', context.onScriptL          d = function (contlows multip+
  = oldTicke great to add an errbled: t     return = s;

    frc.l    (readejsVars.define));'t.nextT       : './';

       uireCounter        //  conain script in             '\n}(requ     iP      o thrag            e scDete    each      mainScript re }

ings = co=  contents +
  n localR\                 ronly do          ly to allow tofe;
  ' + moduleN  cfg.depValue = with use strict g to k              }
     g not supported in Nodt.
             }
       d isFunc              exad(con          e (as cbs getGlobai   /          //aded
 

   achP           } cat        pValue =t we canno      istener
                //is used, then IE will fire error before l        yAddingScodule corresponding t     r dependenction (requireun nul   usingPat argument's
     rmalizedMaonfig.shim[mfunctio cones. Differs from
  wn(rrl, ;
        do ta   /e fun          if ntext.startTim      contents = r                         //next script' }

 
   Sync(url, 'utf.
     t;
                  useInt.load = function (context, moduleName ' + e);
               }
ction () {
        ) 2010-     } else {
                Sync(url, 'utfalizedMap.id);
  iginal na URL of  += 1) {
  ,
                //makeed. However,
    tem requesting         #393)
     ,
                //makey be
                //resor if it starts with a slash, contains a quereakCycle(mod, {},.originalError = e;
      ocal var r");
        "r') ts;

   rce ID.
      in tzy
 ix +                    ;
                         e #202). Also, if, function () {
                //Get the or} else {
                     il be att f   pable etion (originalName') {
         
         tive = false;
  me, since relative requires m.map.isDefine &&       //resolved differently i       context.registry[moils
 */

/*js     }
    ef(moduleName, function () {
                       //to thW       ng =                functi, 'Md  err.moduleN  contextbj[prop];
 rl, or('Tried lois node, ptData(ev (issue #202). Also, if relative,
                //make it relative toto the URL of the item requesting it
            false;
  ext.registry, mo           var dirName,
   .map.isDefine &&  map = hasProp(context.registry, moduleName) &&
                              context.registry[moduleName].map,
                    (env === 'node')eturn (interr.fileName =              Scripts, iunct+
  e);
              
        fn();and not name of the /update t        lName.charAt(0) === '.' && pa dirName.pop();                                    }{
                   ts;

   '&') +
         "           originalName = dirNam the URL of the item requesting it
           } else {
                    'with error: ' + e);
    - removeListener(node, context.onScriptLoad,ction (text) {
                     map = hasProp(context.registry, moduleName) &&
          reJS xpconnect Copyright (c) 2013, The Dojo FDojo Foundation All Rights Reserved.
 * keNodeWrapper(contentsrn req.onError(err);
                mous modules.
        context.completeLoad(moduleN           if (!mod+ ' as module URL.
           are function ar     rneedsers, si    Stat= getOwn(regdefine/require.
      map = h            /url));
 s sen          originalName = ppress. dependelt file na          
              istener
ous modules.
        context.come, since relat() {
     (exists(url))                .toormali.
        .onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the aigina execution, so to tie an anonymous define
            //cal        ((url.igin') {
     ) {
       s modules.
            cots = b) : [mainScript];

              an be tra or for other
     
             hasInName);
    };

         //(isswarn('Shim co            }
        //node.attach();
                } e        //https://connect.microsalse, process: false, window: fafunction callback  that modifies any /env/hen this iges: false, process: false, window: fa
     r a data-main attribute to set main scri nodef (found) {
       JS info from  //moigina
                ma     if (mod) {       wser.
 */
(functi      ation            t thing safely..
             removeLisized, rride ) {
     ed, id)) ongth 
            load: f   //rs on the node.
          url) {
   eNodeWrapp 2.1.8 Copyr func,is    }
       ved.
 * Avif ((tdeps, callback, errba    env = 'n args.
 //gitpeof ull,
                      //This allo\/|\{eepMap;

        returnzedMap)    \/|\{entext@param {Boolean} pts !== 'u           } catc   }
   refox 2';
          url = syis require
                 /**
      h.
          //requ       returtrans       nv = 'rhin && typeof se             . Gotions)       be
           * Given an enormalizks for Node, Rhino and browser.
 */
(function ().exegie);
  s define(   var pathRegExp = /(\/|^)env\/|\{env\}/,
        env = 'unknown';

    if (typeof Packages !== 'undefined') {
        env = 'rhino';
    } else if (typeof process !== 'undefined' && process.versions &    e }
  ocess.versions.node)('{') =        env = 'node';
    } else if ((typeof navig   return functor !=me + '/');
   */
 i--           } catc      return p, traced, pr && Components.clpts !== 'undefined' && typeof self !== 'undefined')) {
        env = 'br(typeof Compond.
     !== 'undefinemponents.classes && Components.interfaces) {
        env = 'xpconnect';
    }

    define('env', {
        get: function () {
            return env;
        },

        load: functionW    et = 'utft    ofncti         t.
     Count           Componportnction al
    /xpconnect/ad commao     );
 rl,       env =JS
    '     mair its com         ress.node     t supportl be attemtill makes seor objec    S variablef('.'),
      F      trane &or) {
     ndefined' && process.versions &       ocess.versions.node)/problFke it rel(typeof Compon= 'undefined' && typeof document nd
  = 'undefined' && typeof sedStarMap) {
 or !=sArray ||ontext ? context.defQueue : gloit) === "[modu'    * it is assaF    unk, {        }irst argume         } else {
       vt.srceq.nextTi         } else {
       et interck(fn);
            } else {
       a web nd it is d config value      url = synormalizedN    //work thouLf ..` var c.versions &, th`llGetModule(t = context. Ir an s `(id)`exec = fe attac        args, strict'vironmeal baseUrl if tepin;

 ume the udefined' && process.versions &, the      isArray: Array.i     asPr      } elsenewCstrict'map = makei;
    var len = this.children.length**
 * if (ense> 0) {*
 *   newC1.8 Cop = []**
 *   for (i = 0; i <cens-1; i++e Dojo Fououndation All.push(.js 2.1.8 Cop[i])ts Reser BSD license.
 * seaSep.com/jrbu}ojo Foundation All
 * see: http://github.com/jrbu.js 2.1.8 Cop =undation All**
 * *
 * TreturnRequi**
 };

  /***
 ** Call String.prototype.replace oJavae very right-most source snippet. Usefulenviroved.trimming whitesphe tfrom-leveend of ale to innode, etc.envirenviro@param aPattern The pevil: tto by the  file.
/*jslintRy the menttrue,th enatrue, slop-leve nomen: with file./
  S to iNodes modified by the Rist. = functionnt: false,
_lse, java: f(t evil: ,*global readFe Dojo F@liceasttion e r.js 2.1.8 Cop[.js 2.1.8 Copyright  - 1hts Res10-20 self, loinstanceofnt: false,
e Dojo Fouquire, dealse, java: f navigator,
document, ime
 * in eithelses, refiedofs, self, loc== 's It i'e Dojo Foution, Components, FileUtils */

var req =le, args, readFile {
    var fileName, env, fs, vm, path, e,
        nodeDefine,
 * se''existsForNode, Cc, Ci,
        vv, fs, vm, paer a Java/Rhino or Node enviroSet-levee to incontadFived. shell offile. This will be added prolevet: falMapGeneratorenviroip-levee to isCargs.js
ield file.
 */

/*jslintt: falFiletrue,oArgname thejslib/rhinooArg     readFile = typeectArgs rue,/args.js= 'undefined' ? readFilprint: false,
console: fasetull;

    func=*
 * e, module: false, rem/jrburke/r.js f( = typeof r, null;

    funre,
        node to iectArgss[util.toSet. It ior !== 'unde)ptimnull;

    fune
 * inor Node enviroWalk over'undetre!== 't: false,
ss = e walk enae, moduleis calleds
   eachenvirofined' ? ren showHelandFilepass//UsdFileFunc !=s.reb/rhino/args.j file.
 */

/*jslintF true,traversal     readalse, print: false,
console: fa';

ull;

    funsor usage.');
    }

    if 
        exists = (aFnre,
        nodeDefine,.forEach(e, module(chunkMIT or new B10-2     fine, xpcUtil;
(function (consolages     

        exists = xistscom/jrburk*
 * Thi},   nonv = 'rhiObject.keysee: htundefined') ||)wser env');
       e to iof rKeypeof PackageaFn(     le.      (type-') === 0) {
    fil'undefined') ||
-') === 0) {
b.com/jrbu    fileName =typeof self !==Rr a Javae deRequue, resentaodule= 'unisshell of the.= 'unsdefined')) {
 enviros.reconcatenates mentlevelariousnject ots togethinedo on      rhalse, print: false,
console: fato. It ialse, module: false, retext.eva(mportScriptsstr = ""**
 * .js 2';

');
            return fal    += !== '//Set unv = 'rer a Jastrhino or Node environtext.s
        rhinoContext = Packages.org.mozilla.j aloenabith      rhienviromap) {
            return rhinoContext.evaWithjslib/xpcluateString(this, string, name,nsole === 'un(aArgsmportScriptsgnnect/elocaDojo Foucode: "",(consoleine: 1 print.acolumn: 0/Set up 
 * @licmundefnew jslib/xpconnect/ar                 e to iMappingActivealsealse

        exists = function (fi, originale Dojo Fouion () {
.             returnse;
  cess.ver if (fi !== nules toe's req&&ocess.ver.pplydule via Node's require before i argumdule via peof Package //gaddf proce(of Packages e to i:e before ie to i print.a= recess.ver:eof Packages .apply(u before it
    path = reqd, argumenUsed in requireNode's requ}  path = reqion () {
th');
        //In Nod) {
      istsSync is on fs.
       ) {
        ode = fs.existsSync || path.nc !   existsFonc ! = 'rhino'nv = 'rhino(typeof process !== 'utruined' &  }ath, exec,(typeof process !==        fs = require('fs');
        vm existsSync;

        nodeRequire = require;
        nodeDefine = define;
        reqMain = requy hide require and define to allow require.ndefined' &
        }!== 'usplit(''& fileName.indexOf('chreturn false;
    ir, no\nire,
      node) {
      pply++com/jrburkde) {
        uire/ Ava = 'rhino'.1.8',
                       name            ';

     v, fs, v } else    existined') {
      .indexOf('-') === 0),efine t typeof document  //g((typeof navigatoeName);
        };


     fileName) ew java.io.F{       ) {
        en,ame :          typeofexports.t: false,
 =    env = ';

me) /* -*- M     js; js-indent-level: 2;roces*/
/*
ironopydist. 2011 Mozilla Found = PactGlobaltributorseof LicenSyncundined'))New BSD lponent. See LICENSE or:eof http://opene to i.org/    envs/BSD-3-Clause
f (t
define('e to i-map/    ',     readF(require r..subst, modulire = Node enviro= argis a helper     readFved.gettevalvaluesile. I*jslieter/opodulsenviroogs[0]s file.
 */

/*jslintrgsowsereName. we are extrac = args[0];

   y: true */
/*nc !=wsernc !== 'undepropertyommandOpame = apy: true */
/*defaultVs[0] An leNamealrgs[0] proce a Jai = args[1];
   is missings to coe. It iseName.. Iages.oris not specifiedponen   return FileUtils.get, a = fs* errorgs,
     throwreturn evale, modulegetArg      , aNamefinD           e Dojo F10-2ction
          log: fjava.io.F     [ctionhts Res
        //argueadFs */

varr, n3be an easier way tath) {
                  ,
        row
    Eorma('"' +nction + '"interfComponed {
 i, pa.'v, fs, vm,     e.substrnormal = normal.inde@licurlRegexndef/([\w+\-.]+):\/\/((\w+:\w+)@)?':')= -1?(:(\d+))?(\S+)?/.indee, moduleurlParse(aUr
              t.mak  dir.     (path.inde fileNa10-2!     be an easier way via e
 * in either a JaName) {
 che         [1] print.aauthplace(/\3/g, '/').hostplace(/\4/g, '/').subsplace(/\6 = 0; i < alit('/');
7]s);
      !== '\\' &&
t workin =nt workinUse the current wonnect/orNodrseddirectory.
    url             .ath.re + "://;

       va(i, 1);
  splie Dojo Fou.spl+ice(i, 1);
  spli    @"
 * in eith  i -= 1;
                    } else if (part =    e
 * in eith  i -= 1;
     subs           } else":"har                       i -= 2;
           a             } else if (part =    e
 * in either a Jaur  }

t = ary[i];
   ) {
          ) {
    Use the currenjoin(aRoot,nt ev          ary.sp.indexO  i -= th    path = xpcUtibe an easier way t    e
 * in 
              charAt(0)ir, no/'uireth =           File(x)
          upfile: lice(ithrow nepath) {
    ) {
     urlv, fs, vmew java.io.File(xexistsFor/\/$/, '')'/' /Char File: fu!== '\\' &&
ils. =tils.or Node enviroBece:// behavileNaoes wacky when you set `__ modi__`top-eName.i, w       hav{
   prefixontext();deRequs
   our     ging. n arbitrary failacter file.
 */

 'xp    s://github.com/mundefi/leUtils.jsmpull/31poneertStreath);

                //XPCOM, you sissues/3ts);
.
 */

/*jslinxt.evalaStrgs.js
                   (typeoftre Dojo F       '$Char Sle(file== '\\' &&
       (typre.j      (typUse the currention = fileNam                .crstan.substr(1 filei.nsIFileInption = fileNag, nion = fileNaUse the currenrela !==File(xpcUtil.normalizile(x                   //A file.indexO ary.splic    }
                 i -=  ' failed: ' +  "/"uire    it(inS     reeam.i                    th.s          cg?*/encoding) {
          xOfFile(x read ' + e)ts);
   ?(),
                */

var+ 1)ENT_CHA:nction that can deal wream;1'] =tream;1']eName =dules/FileUtils.js        Cc = Components.classes;
        Cypeof Components !09- !== 'undefined' && Components.classes && Components.interfaces) {
        env = 'xpconnect.txt';

        Components.utils['import']('resource://gre/me.substring(1)xpconnect/arble()mpone('.XPCOM, you sleUtils.js-ion () or')        convertStre;                coConsumeeam.close();
                    }
  c                if         ) {
            ;
     close();
                     the          fileName =
//DideRebu {
 interfaces        env:
//Components !=2 (c) Mihai Bazon <m;

 .b    @gmai reqm>
        uglifyjs2', ['s.class',              r'loggerleNaenv!env/oArg']       Cc = s.classesMOZ_       co, me).ex, rjsrtScr {
ForNode(f/Define a globersions.noancy t["U     JS"ptims.classs.real"dingdeRect;

    e, modulearray_to_har deapper(string@licre    rgs[0];cre    .js
 s.realpathved.
@lic * Availablayright ( ++i)unct[a[i]ptimjs to define      .crre          i -e, module      a, sta        }
        .crAle =//github.com    . = f:ts=4:sw= || 0v, fs, vm, pae, modulefileObj =s(s          w java.io.File vm.run"", The Dojo Foundation member(nc !,sole =erved.
 * Avnt.apply(undeole =rguments)--i > Avai)    varray[i]ing,nc !     a Jav}
            };
   ndefined' &ojo Foundation find_ifForNo://github.com/jrburke/requirejs 0,  BOMfor details
 *lablns);
   ');
        //10-2e, mtrict: un)ict supporict: un exists = functiojo Foundation repeat_deRequ Res, exp: true, no10-2i <=The t suppo};

    */


(func== 1 (global)ile(fil   log: fulocatScripts, setTimeout >>         rentdelseds.realpath
(func&ead,yAddiement, dataMat suppongScripojo Foundation ath) {
sf (firmsg,
    be an easi       mslla.msgs.realpath.js 2([\s =*([\s '2.1.8',
        com       svar s\*([\s, croa return false;
  {
   r, nrt i) {
   = {        log: function{
   ||/\.js$/,
    ;
   ]+)["'nt.apply(uni     ing stret.hasOwnP[1];
  (i)trea!([\s ostring = op.toSt)          imentRegExp = /"`    i    `        a supsubsed: funct"\*([\s\       print.apply(uniquiresing st
        hasOwn = op.has');
        //    unevirRegE&&irReg ostring = op.toStr?irRegdocu:ypeofwindow, navigator,      };
        }
    }

    /** vimerge(objnts.=4:sts=4
 * @rowser = !!(tyd com10-2ex  ostring = op.toStavigator && windobjdocumeex.docportScripts !== 'undefined'obj '2.1.8',
        comnoop 0,       @licMAPalse, modul 0, null)o Foundation MAP:ts=f, backwards\S]*?)\*\/|( log: function[], tondef   r/**
 * ete, but ]\s*requioitt sure how
  , dataMain, va    f(    out,            rf issues.is_quir =3' ?
ine, xpcUtiLa        true, nomen: tru : /^(c)3' ?
  val.v          /^comple10-2lete|loaded)$/,AtTopavigator && wind/^complete  //Oh the tragedy, detectiecting opera. See the uSp    of isOpera for reason.
 \/|([op
 * s.apply(tope test w/o  ?/Oh th       ).re{
  e() :/Oh th           /^complepathSync(name) : '');
 
    function ,
      operue = [],
        useInterm === 'PLAYSTATI
        //    ule ski of isOpera for reason.
  'undefined' && opera.toString() === '[object Opera]'          conteret = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function irray]';
n(it) {
        return ostring.call(it) === '[rm === 'PLAYSTATI        : /^(c          /^co(ary, func) {
     a. See the usgithub.com/jrbur            test w/o causing perf issete, but needejs fetails
 */
//Not using str.plat) breae';

    rue value, it will     glob            }
        ,
  }
        }
    }

    /**
eractive = false;

    functived.
 * Availablarguments);
         break;
                }
    (ary, func) {
eractive = false;

    fuved.
 * hasing str
        //specifica      break;
                }
(ary, func) {
t supporop.bal().
   nv = 'rhino';

     to f.at_eadyRe, but not(it)vigator && window.     ewusage n(it) {
       .js$/,
    ry[ivm.rc= 'unary[i], i, ary)) {
                   ra.toSk;
                }
         /^(comp    }
    }

    function hasProp(obj, 
   k;
                }
      if (kindef     op) &&\.js$/,
     navigato break;
  vigator && wind.js 2v //Oh                if (ae, module:rop) {
   ver properties in an object and calls a function for eacp) {
    ver properties in an object and calls a functio       MAP '2.1.8   }
    navigato * s_uniqtrict:, e     * iteratg strict:nputStrear (p<The        * see*String?*/}

    /** vim It i_templ    text,gs[1]s\S]*?)\*\/|(t supporete
          {(.+?)\}/g       Cc Timeou of isOpera for r        {
  [p'loaded', ex, The Dojo Foundation remo']
     for (prop in objke/requirejs for details
 */
//Not usin: true, nomen: trurict: uneve=or (p         }
 (i,ipt, currentlator, document, impors loaSortsource icm of isOpera f) {
      */

var< 2e */
/*global = {},
     }

    /**
     s loada, bady have a prope: funyRegExpaat may bat may  * Ava           }
wh    (a   * returns
   blablb{
        if (ary[i] && funcmp(a[a    b[bi])ction ? r[i++cumen[a (!ta: if (!targ    ++'loaded', e         if (aroperty o   * returns) ry]';
    }

 , a       ai',
     += 1) {
      && typeof val          }
    b       b           mixin( };
     and calls a function for eac_ms           logroperty o{
       head, baseEla                    && 
   flo   }{
      / 2), lef            0, m), dist.urn target;m  }
    }

     return tar ret                    //S tarct is                    } s load ret}

                    if (a        targgithu  }
    }

    /** vimet_differenet:ts=           if   }
   .filtern't
        ary)) {
               b       if (hasPrple function to mix in properties{
  inghtse      n function () {
            return fn.apply(obj, arguments);
        };
    }

 Not ule function to mix in propertiesmakePredi().e(wo/o causing perf) + 'xpressor (i = 0; i < ary) tation=  funca the MI T or new
 * @licf   };, ca= fuights Reser  out:int.apply(undefined, n getGguments);
   [prop] = valuent.apply(j* Avaij <ue) {var g = gloj      e) {[j][0]t, ary,
        [i= g[partalue !== 'string') {
       prop)       }  }
    }

    /**
ts.cinueetur      for (i = ary.length - uncti * se[        } tructs an er a function for eaccompareTo
   ady have a property of  g[part];
 ad, baseElf      baseElemeame n    JSON.func(oify
   [0]e re";{
    var reserv     swi patRese{ original error,t.apply(undefined, aaram {Strs);
   , if tcase
     * @param {Error} [         original error, if tt support i}, #392, and c{
    var r(ary, func        {
      >            ormation.
 sStri    }
                 if (fonts);
       */

var rary)) {
              t  }
    }

    , if there is on);
     .
     *
     * @returns {Error}
   unction (part) bal;
        each
 * @licca //S
     'loaded', ealError = err;rror(id, catg = g[part]s) {
        var e  fs.
 o an ID ca    //first, sin(ary, func) {
, if t}uirejs.org/dractive = false;

   return;
 presseigure out what 'this' will     F        "str", function bind(obj, fn) ght (    fopl that eub.com/jrburke/requirejs for details
 */
//Not using st!n;
      loppy: true */
/*glname) {
             brs to defi8',
        commimodularyt sure how
  .js 2_gs[0];
on () {
                    princtionsizableerr;
        == 'undefis modified            urn :op);
    }key,    ady have a property !.js 2has

  )) ++config obj{
            nction(requi["$    keycumeect and callseither a Java/RhinoexistsSync || pataddned;
    }

    function newContext(conextName) {
    ') {
        //If .js 2get {
  l break out of the loop.eractive = false;

    fu      config, [     tructs an error  ary.length - 1; i > -outId,
            configfined;
    }

  ary)) {
               ule, context, handlers,rr;
    }

  path = rd  }  baseUrl: './',
            ot set a default for map
            --  var inCheckLoaded, Mod       et: tru {},
                pkgs: {},efault.
                waitSeconds: 7,
          has   shim: {},
                cglobal) handlers
     f just ena pkgs: {},
           (pa   shim: {}fal;
        each(value.spnc) {d.
         ) fset a context,               
             path = r obj   shim: {}/',
                paths: {}inCheckLoaded,lFetched = mandO          undefEvents = {}ues.
            *
     * @returns {E   defQueue = [],will brea
            defined = {},
                        } e    }
  avigator, d= 'undefined') {
            consDEFNODE, rhi)) {
  , methodse tes   }
           var i, part, ary,
< 4)ch ac = AST_ fileNn
    //dot n {
     {
  
     ath, e that us {
   vm.run/\s+/
           if (elf    ion should,
         * a the ixinase.PROPShs that ushould i -= 1)rray.
     zed.
           envew Error(m/**
     *ST_        r+ "( {
   {s, bu {
      {
    var r@returns {Errhould rget does not already have a prope  env = "d.
         * Si]rimD     for  ary[i];
       quirejs.org/docs/error@lic modi    input a    (i, function (va{
     tout a 1;
 .initialobje||    * whut a   * wh      } els)         part =     } els()quirejs.org/        p}defined') {
segmetream.ite and exist    )            i -= 1;
 += 1) {
         tor;
        req 1;
 {
            n-dotBASEice(i, irejs.org/docs/errors.hth act rray.SUBCLASSES     *n-doay of path n-dot
        .CTORe iseam) tly to disk. 
         fore if     }

  to disk. SELF_        * NOTE: thath mapping for          
            rexec, rhi at least one non-dot
        .TYP at n-dotable
  fiedirejs.org/docs/errors.ht   * wh = Objeth se                    
        //specifically. Sequence 10-2/^\$/.testifically. Sequence to disk.[d = {},
   cume   * whready in play viaeractive = false;

    fun-dot
        docume      i -= 2;
           rejs.org/docs/errorn-dotDEFMETHODprop);
    }http:/   * w    * iteration is st          nc ! }
                     }
            is likely
k is unfor  fuTok the  name lo"me th", "    r () {
t
   col poss
 *} banlbon(r, par_befor' ? re", {},e.js
           d resulte relative nse,
     2010-ende arkely
     loly(u          requireCounter = 1,
      d.
   theset a         urlFetched = $doci, pa = Pa: "Bthe class the ll    f thes  print.a  $E: tdocth');
        //4:sw=: "[} name th]eadFilerst te thekages.or theeturns {Stry = {nd */
        functio/^(coalize(name, baseNamd,
            conficonsohe map confvisicorrry)) {
                      ._     nly be done if this normalieSegment,
                foundMap, foundI, fd.
   xists        ion mixin(target, is relative
d result.warn_ navigatoe via 
                maprop);
    }top)) {
              10-2           map = confi)            map = confis onc(obj[prop], pop)) {
    //Set up ive
        StatreadFi relative nIf have a" is re applyMap apzation is for a dependency ID.
    sf have as{
     lative
        Debu).ex base name,  will
  rmalize against it,
                RoContextterfdwill
   e it is a{
     ,   //If have ael require that irt.gelable          , baseNa     () {
scopme arainst it,
               '           if , baseNa, likedefined') {
  'turns {String} normalized name
   gs[0] */
e && nunctio () {
kages.orreat it a aterfplai (func(o (it'ype,
      fu. It i!)me, applyMap) {//If  */
    S/If /Sunctio//If  thay jsormalizedBasePffme.i, nameParts               if (getOwn(config.pkgSimpleIf have a base name, t//so that . ma    bodythe baseName is a package nam"Ame) {
    h a sis = arthe t foContsionned e. a = 1 + 2eturns {String} normalized name
   name */
    se,
]r instance, bar easi(should     bre hSee the us      if (get, nameParts, i, j, nameSegment,
                foundMap, foundI, foundStarMap, starI,           for map
                /name       normalizedBasePart    e.originalErhe last part,
                navigato';

_name( the r           foundMap10-2la.janametory, 'one/two' for
      or map
        rimDots(n       normalizedBasePartsath, epackages mser env');
     (e it  //Some use of e it       normalizedBasePartsunction bind(        Blockme)) {
      getOnot name of the baseName's
             ts(naofme it is a  (usually bracketed          } maps to
                        //'oIf have a*wo/th  rete = name.join(                  //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.lename.splits = ba               }

                    name = normalizedBasePartConfig = getOIf have a base name, rl, pull off trmalize against it,
                A bgetOwe) {
                  getOlative
        EmptyIf have a base name, ly map config rmalize against it,
                wserey ma           (rMap))      or s//soy    emicolon          } meSegment,
                foundMap, foundI, foundStarMap, starI,
           e last part,
                        f have ansolBs(nabase name, try to no        not name of the baseName's
           ependency I
    sume it is a nvert ts.c basringnespsp       `For`,     In  //Do  //W    s on ith`      if (pkgConfig && name === pkgName + '/' + pkgConfi]    /name;ges.orgnt thealwaysrectContext, eve      [base];
   .
            i                 //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    }

                    name = normalizedBasePart        LabeledIf have a base name,  if (mapValue) {    lif ( of the baseName's
           If have a ging. D mapVal    if (pkgConfig && name === pkg mapV */
     if (]        uire     onalue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if i mapV;
                    }

    s.length - 1);
                    }

                    name = normalizedB        el require that WLoadyRe                   cond  //Ma              //Find the longest baseName sedo/      e it is a t                 if (mapValue) {
              //'one/two    l             .  Snt the directory, 'one/two' for
     alue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if iar map mat foundI = i;
                                    break;
                                }
                            }
        lice          o          name = name.substring(2);
  `do`         }
            
     lative
         the Map, nameSeg the nt);
                        starI = i;                        }
                }

     Fream.elative nForela"    tar map ma ste                        starI = i;for                             if (mapValue) {
         //'one/t?ck for           } el = Pac   comor/no p    rMap)me, applyMap) {                //Che     name = nterminjoin('/ce://
                }
            }
        return name;
        upd    unction removeScript(name                 //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.leot set a     asOw  scrip                if (!foundStarMapot set a          tNode.gmap.
                    if (!foundStarMapot set a     tNode.g                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(stSo, dI = starI;
    I          nc !==gs[0]        if (foundMap) {
             ... in        nameParts.splice(0, foundI, foundMap);
                   name =/    ameParts.join('/');me, applyMap) {       '/' + ymbolRef     na a st

  ab    onlyNode`    totypwo' Varme, applyMap) {pathCofig.length > 1) {
     covert we'r arrayue, phroughalue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if ietAttribute('data-requirecontext') ==ode.g, []).p foundI = i;
                                    break;
                                }
                            }
       est       if (!foith    stance, ba        if (foundMap) {
         ging        nameParts.splice(0, foundI, foundMap);stance, bafig.length > 1) {
 ndexOfefix,
                      //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length stance, bae]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(na                if/If the"reat it as value, ssts.concats uses_ging.equire     an nt_ //ConencloSynccnc !  }

                    if (foundMap) {
    gment match in introduc/file lexical //If th    if (pkgConfig && name === pkg* also nor.
        *    ain) {
     * also normdecla       defQt module map
    
 * @lize the   /rgs[0]elati     of  var ->  off tDefme segmenID alread/name via rdules/Boolean} isNormalized: is the name via y normalized.
one
 `ID alread`, butnce itliste name via@param  = Pa  break;
        quire.no   /boolean    tells-8";tion (n} isNormp is name.substri      nameParts.spli map is fe()
 dependency.
         *
         * @retuonfig.
st treat ie = fUsed by ancy t `e()
to smallest 1) {
       *
               ?pply tnkUsed by  namePisNormalized: is the       *    /s true ifrelati
    e, assumeoff t        //Mn the cndOpacceeSyncCurWork  * @retu@parny 

  /If true if this mapparam   /ocumger    cur     putStme semangl= argsize the (uSyncocumen
     yk for     er                        }

            //AppTop
    e relative name.
       ancy ts        if (foundMap) {
      tringme.
     module map
         * for the module na       y normalized.
         * This is true if this calinteram {Bonc !          name = pkgNawrap_      *he map confarg_    if (f_pair causing perf issues.* NOe r.js              }
   Exp = /nd .. from an ar  ary   if (f{
            reonfig[1];

                         //'ma    for map
                 m.ru    aiia the MI:lue) {
     luginModule
     *nt fo[err                  p);
      .
          1here is no defaulif (name) {
   @lic    ped_t    "        e. ary[        ifils.F","les) ){ '$ORIG'; })ize) name.               original error && pluginModprking && pluginif (name) {
    && pluginMod && plugin.transform(    TreeTtion (naeturn fn.ap hat thtrimD                         easiory, 'one/two' s, baseNam);
      () {
r.
 PluginStream.ava, func) {
        if        }
 (* NOots(nnction for iterating      }

                          }  && plugin                basePa    al nonjules
       http:/s.clas_as
        fs ={
                prefix = normalize(to_s.clasix, parentName, appompletgular module.
           undeflf.figure_ou   *
     }
    }

    /**
ized xistse) {
    'uneturn fn.appurn normalize(name, pareparentName, applyMap);
     s true i only be                 //M().ancy though.
     function isArray(it)!h requirejs.pplicatring() === '[object Opera]'lue. Should
rarileven     nc !e = [],
        useInt }

    ze(name,hasOze(name,     *urn n {
        return ostring.call(it) === '[, applyMap);
   ame, parentNamdule && pluginModule.normali  //get fancy th{        '    nc !=+ "' console ===//Plugin i'$EXPORTSn is(rg i        e.){er a Java/R}()))ze method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
     directory' and n in normalize. The map  easi       j = b
    function isArray(it)        suffix = pref && n) here i trimDoge      eak;ing() === '[object Operarror(i      :
     * a true value, it wil               normalizedNa           return {
          //If th  prefix: prefix,
         @licts(nax, parentName, app    /**
     * normali            //'maiymmeParts = splitPrefix(normalizedges mzedNam    prefix && !pluginM;
        vm inalName,
                :      ST_Assign       id: (prefix ?
              rototype      prefSub!' + normalizedName :
                 {
              ne: isDefoff the Name) + suffix
            };
        }

             s.classx);
      istry, id);

            if (!mo})odule, suffix,     mod = registry[id] = nes[1];
  tion getMod, setTParts = splitPrefix(normalizedra for reason.
    th.
symrarily hide restry, id);

            if (!mod) ction on(depMap, name, fn) {
        ) {
                mod = registry[id] =1];
    : "=Module, suffix,     * a true value, it wist.tion getModule(depManalNction on(depMap, name, fn) {
    var id = depMap.id,
           alized = true;

                 if (pluginMolse {
                        lizedName = normalize(n    target[prop] =e loop.
     */
   , applyMap);
                    }
                      /If                 imbdof '                   utf8')rgrefixp is far i, par  }

                    if (foundMap) {
    name via le map
         * for the module na       //Pop off t         //     nanc !== 'unie name viaModule, suffix,n);
       //Pop off tFunargg.ma {
          consol    }
         function mak } else { dependency.
         *
         *e.
       ginalN {Obje } else {k(err)(scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            s stric    mod.ee]
        //with the plugin being undn);
                 origiarg

            return {
 arge]
        //with the plugin bein    }
            }      // No baseName, so this is ID is resolved relative
                 } else {
 AginalndI = starI;
  if (!no          name = name.substring(2);
  sevil:/ame ;

                      mod.o    function has= config.m starI;
  ;

              name = name.substring(2);
   navigatong(0, index);
    }

        /**
         * DefuhFallback(id)lobalglobalQueue items to this context's
         *        //Match,   }

        /**
         * Jum            }DefQrmalize against it,
                //otherwise    “jumps” (    no    a[bas`        //       //
    `ponen` a point`                 if (getOwn(config.pkgExfor ravailable.xi      }

   }

                    if (foundMap) {
    “exitext co        to def/local       if (pkgConfig && name === pkg with.
  return name;
   () {
      sp =    nt s it is} isf have a; ct thebe          prefntext.x);
                name = name.substring(index + 1, name.length);
            }
       in an () {
&&e map config to the value.ies in an }

 e]
        //with the plugin                 name = noDefQlative
        ntext.
   //on conequire't);
                        starI = i;efQueue.e) {
                 text   //internal na      relative na
   'exports': function (mod) {
           /locald.usingExports = true;
                if     ectAro          if                 mapValue = getOwn(mapValue, nameSe values since t a star      name.join('/ar ref to defQueue, so c                 if (mapValue) {
                   he first arif (
            none, nameParts, i, j, nameSegment,
                foundMap, foundI, foundStarMap, starI,require                  } else {
                       foundI = i;
               makeRequire(mod.map));
                }
   B    he leading do    'exports': function (mod) {
           r ref te) {
                            lative
        ectAointe   //on con, mod.ma'exports': function (mod) {
           Queue, so                         pkg = getOwn(config.pkgsI    elative nIf              a ret                             starI = i;if        */
        fun                 }

                    //Check for, mod               pluginModu           + '/' + pkgConfi     namth, `    t   if (mod.modut; j -= 1        //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegDo not set a 
          rror = 
          d.map.id,
                        uri: mod.map.url,
  and path. If parentModuleMap is p      base name, tere ir prefix,
                index = name ? name.ihere iOf('!') : -1;
            if (index > -1) {
                prefix = name.s   if (m“discri    nt”x);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a modul     // No baseName, so this is ID is resolved relative
       }

            //AppcessedBrand, traced, processed //bei               //Array splice in the values since telse {
  b//beiix = namnot completed
             ath) {
Queue() {
         nt);
                        starI = i;
      `        een macannot just reo still in Own(config.pkgs,the end);
      as     efix,
                index = name ? name.irror!processed[depId;
            if (index > -1) {
                prefix = name.sined[dng(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a modul     // No baseName, so this is ID is resolved relative
                        if (getOwnTr            iTr      c     bf.verle of the baseName's
             `tryod.map.id + '/' + pkg.main) :
                back,
   //PopC         naack,
  getO                        }, mod.map.id);           //PopF           na        using waitSeconds of 0.
              name = pkgName;
                    }
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is Do not set a back,
rror = back,
               scriptNode.parentNode.remov        bother i       d.map.id,
                        uri: mod.map.url,
  }

            //App waitced, depId)) {sed) {
n);
                mod.defineDep(i, definif (m    ;nce itglobs snentePar{};
 the stSeconds * 1000,
                //It is possible n);
      //Pop off t //Fi]me : nulomplestarxce ap.sp                 //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length n);
          dep = getOwn(registry, depId);

                    //Only force things that have not completed
             al && ( method to tr         ;
                        starI = i;         eachProp(enabledRegistry, function (mod) {
         ed up
                    //in the          ueue() {
                 *pired) {
    try,
                    //and only if it hvar`    uppost  eachsapplyue, suld only be t/ameParts.join(s}
            },
            'module              //PopVar ? pck(err);
  ngPathFallbired) {
                   //this normalization.
                        normalizedBaseParts = baseParts.slice(0, baseParts.length                         origide undefEvents = {} true;
                                mod.emit('error', err         //this name.
                           Va                  /If the module should be executed, an                      }
              Own(config.pkgs, m(compd);
        s              if (dep && !mod.depMatched                             //loading. If the only sti    }           //No De     nc !=              apsp.apply(defQueue,
A             only be Prop(en& plarData a        if (!mod.seName, applyMa            var ids = err.requireModules,
Var| map.id;

     ]ileName = argngPathFa           expi         globalDefQu     } elsr
         = 'undrebaseN (expired &&   noLoads.push(modId);
                            removeScript(modId);
                        }
                    } e             if (!map.isDefine) {
   ot set a     rrror =     return (mod.require = context.makeRequire(mod.mapCheckLoaded = trul          if                   ed, u  c = pkg ? getOwn(config.configthat maps     efix,
      
            if (index > -1) {
                prefix = n   //Not ext    voktry, e;

            if (errbac         se,
else {
      } else {
);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapname.{
                            notified = true;
                            mod.emit('error', err             return onError(err);
) {
.
         *e                    if (mod.exports) {nStream,applyMati = Pa.  Der normCurWoa   if (needCyclsince itmodu exactlt is as    s[1];
 itched up
          d
              eq traced, proceq     egmed rea req.onError(err);
            quretu          br(twoeal na-se{
  psp stance, ba               stillLoading = true;
 caop(d.length > 1n normelreadFibase   checne = true,
     d, 50);
        se       }
            }

 done if this normaliz    he map confx, ./',
                  edTine: isDefeq(x nameParts[1];
seq.eout= x;
            this.dap =       '_unnorm baseEleeq done if this normalizorg/_(err) = nameParts[ ary.length; i += 1(source) {
      ACEM (global)no path mappindepMaps = [];
                }
   ict: 0].ply t   }
    }

    @licedule.map,
      rget,
     * but only if target does not already have a prope  //In     .id) ||
   .
    fefine    ized = true;

                   ndef                        i of isOpera for reaso{
   this.ing,aps, this

            return {
 aps, f=      s.ma      '_unnormalized' ill break out of the loop.
     */
         optionre is no default.
                wule.prototype lFetched = todepExports = [];
ents = getOwn(undefEdy d      of 'nd .. from an ar            init: function (aisDefips.manull, noLoads);
       aps, factois.initory, 'one/two' feq;

            return {
 unexpectedd
                if               //Do not do more inits if already done. Can happen if there
                                config = {
        urn normalize(name, t
          prototype = {
            init: function (depM {
                    return;
                }

 segmee     his.enabled,      ,   re nameParts[1];
         /**
   this.shlist     //Do not do more inits if already done. Can happen if there
    if there is a shorter segment match later in a matching
                    //config, then favor over this star martribute('data-requirecontext') === context.backhat
    me = context.contextName;
                return onError(err);
g =  if (!t for it, bu //"shim"        //Not exs[1];
  the baseName is a package name values since ts[1];
    getOw            seName `a.foo      a["foo"]`          //name to concat the name              prefix = name.“onfig.
erxt ceCheck) {
            new context.M0);
      |         args[1];
   to array
.  undIn(start baseNnterh; j >ts = baseParts,mon cas      'rSub                   d result call, generate aMap = getOwn(starule already.
 o              if (dep && !mod.depMatchedotpsp  depMaps array
           );

                for (i = nameParts.length; i > 0; i -= 1) {
                   return [prefix, name];
        }

        /**
         * Creates a m                name = no //"shim" d
              ub traced, procubreason to keep looking for unfinish'IutSt-stylrgs[1];
    getOw    //wouhat config.
       s enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now tto
         ];
  /if enabled previously, now trigger dependencies as enabled.
                ifUdefit for it, buof cy     (hasPro   this.errba      if (hasPathFallback(modId)) {
        erry                            each(reqCalls, func (hasProp(d         thCon(hasPro     parentName ion (mod) {
                    breert baseNnce.
 k for a g conin(reof still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, the             return onError(err);
of cyP      les, defined calrue;

reason to keep looking for unfinisheof cyc       stance, baseName ` rhinoCi      ++i`p, remember iof cy    this.fetched = trost;

                comanage.startTime = (new Date()).getTime();

     managed     var map = thii++       //If the manager is for a pBif cycles, defineuire(t     retuk for a g || m           //export can be callire(th     var map = thia + bto smallest lengths of baseParts.
        0);
            -h);
  idckLoadedTime         //retry               this.depMatched[i] = true;
     || mod0);
        dist.jn map.prefix ? this.ctch, update name to the new value.
                                    foundMap = mapValue;
                              efce]
        //with the plugin being und || m          return;
                }
                this.fetcheC             d);
                              led,   cht              c = pkg ? getOwn(config.conf               //Not exu.geted'))             thi.shim.deps? b : cto smallest lengths of baseParts.
                  //Chec
            }

         he module is ready to define
                  e is r       //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && s itself, ang
            //scripts, then just trylete registry[id];
            delete enabledRegistry[id];                x + 'tified) {
   x + 'nly
                //if a timeout is nax + 'eadFi   //Not ex—deps= b + 5       //If th                       {
  ified) {
             }
   ed, check for a cycle.
         in) {
  literrl]).
                this.depMaps = dor) {
 );
            }

      ror) {
  );
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
       or) {
 ck later.
        ly(obj, arguments) if (!thisFallback) && stillLoading) {
                //Something is still waiting to load. rgs[0]   } else ifrgs[0]s.eredTimeoutId             //if a timeout is not alrehis.error);
                } else if (!thedTimeoutI  } elsergs[0]g = op.telse {
     edTimeoutId) {
 err) {
                        this.emit('error', err);
                    });
                }

                /edTimeoutId, prefix);
       re of isOpera for reason.
 or dess
                    //of doing that, skip this work.
                    this.defining = op.tg = true;

       g = op.ts.erctiv              apsp.apply(defQueue,
               his.erronfig.sh         if rn (needCycleCheck = false);
    ke     ndicate this module h             this.inited = true;ata = {}AST    lace          wParts true;

nusee:    i    
         existsFcript(id);
                  globalDe]or could h    reialize          d

   exec             furansfer . factory could trigger another require call
                    //that would result in checking this module to
           extName = context.contextName;
                return onError(err);
rgs[0]KeyV      if (!url      exportreason to keep looking for unfinished
is.ev        set, use tha              ir callbacks (                     S       = context.execCb{
    nly
                //if a timeout is not alre         }

                            if (this.map.isDefine) G
                      lue annly
                //if a timeout is not alre
        }

                            if (this.map.isDedule(d traced, procoff taram @retunc !=thedugin  baseName i           var ids = err.requir        tified = false : nu         } else {
                   tervadName =his.mo(    neinalari& !chec                          } else
     tModuleMap ?  undefin                          done if this normalization is for a dependency I @param {off t top-level require thatModule if (!notified) {
     exports = cif (applyMap && map && (baseParts || stanc !== 'aor could have beed.
      }
            }
 cannot just reoff t                  exp         //asModule.exports;
         //        nction () {
                     a non-plugme : nulte))    inrror/            Cc =nc !==e(prei, pa,me : nulieedCot beParts.splice(0, foundI, foundMap);
               relati {
     (expired &&ts) {
baseNaa non-plug);
                                 //exports alrea             //map.isDefreason to keep looking for unfinishe             leMap                                    //                  expllLoading is a
             reason to keep looking for unfinished
     ant            map.isDefine ? 'define' : 'require';
                errbdefined value.
     errb null;
                                err.nay ena  if ((isBr        map.isDefine ? 'defV.
       /exports alreadybalQueue() {
  xports = ex null;
                                err.requireType      }
        }

  ? 'define' : 'require';
                                            e
                            exports = factory;
            defQueue.
         */
 ? 'define' : 'require';
                                return//Figur                           exports = factory;
 Skip things t         map.isDefine ? 'define' : 'require';
         if (
                s.erre   retuif (this.depCount < 1 && !this.s = factory;
         (                           if (err) {
               }

 nction (mod) {
 elseModuleMap    us          sed bis                        err.requireModules = this.map.isRt may be that dule(depMelative to baseUrl in the end.
          retu    some                       / calling chec                        //exportsmod) {
 
                   if (this.defined && !this.defineEmitted) {
      ge. Allo                               //exports= argap.isDefine) iif ((applyMap && map && (baseParts || sta`    `e;
                    }

                        ing is a
       anormalize against it,
                //otherwise @param         
                  'he map config to the value. Should        }
                   exports = thi@mozilla.se name, tr&& n.
                apsp.apply(defQueue,
         his.error);
                } else if (!th with.
          tervaists = fkages.org                       err.r        lative
          {
   .
         * {
          //can be traced for cycles.
     ) {
       this.depMaps.push(pluginMap);

                ) {
      not    icHoweverfunction (plugin) {
                    var lRegEdexOf},
        ocal        //can be traced for cycles.
     r.index    this.depMaps.push(pluginMap);

                ntext.ginMapactual       parentMap.name : null,
                       Ato    ied) {
   tom           //Map already normalized the prefix.
    tomId) {
                          var loa          }

 p.un           callPlugin: function () {
    via `ontin            }

   via Node'           lative
         aNormalizedMap,aN           callPlugin: function () {
   impossihFal       n allows it.
   0 /nts);
             if (plugin.norUnne() modles, defined ne() mo           callPlugin: function () {
    inte() mo`function (name) {
      e same modul}( {
                   return norHo        if (!fdy breason to keep looking for unfinished
hy be    ;
            }

                        //prefix and name should alreaInired)        //theleMap(ma           callPlugin: function () {
    leMap(ma              }

        1                         return norBndencyhis.map, {
  ndency           //Map already normalized the prefix.
   endencyched up
           if (plugin.norFdefi method to trdefi           callPlugin: function () {
    ndefihe plugin allows it.
   ndefied up
       ndency   var map, modIdmap.id);
        i           callPlugin: function () {
     rconf plugin allows it.
       
                          navigato           dCyctested' && !isFunctio     e is , norme it is a confistatOwn(nd .. fr                ;
        require = undMap, s    this.on('er\*([scennormalize it to
      lizedizedName = nameParts[1];
: function);
        this plugin,  ?          } else {
           lugin, right    //on this module} :e UA  nameParts[1];
     ncti&&plugin, so it
          lizedMap);

                         it
                      A chif a .. will become
         * the n (name) { nameP    this.on(map.prefix);

              lizednts, F      */

var r2 - (n-2012,  pkgs: {},
           * s    this.on('error', errback);
                  //can be tracit('error', o;

        /                     }));
                       lFetched = {elfeModuleMap(map.prefix);

                                        equirejsis, function (vh req err);
          l fail, but catches ;
    zedModnit([], fu     *
     * @returns {Err                this.depMaps = [],
         @lic
         eady in play via ano10-2x            l fail        map;
         tion (err) {
        in_endency_, 'dex;
          ed: true
                        });
               });

               ,              --eady in play via      ii, The Dojo FouThat is not
       for this module,
       if (this                If     
         ame n     ||                               eachProp(registry, function (mod) {
               eachProp(registry, function (mod) {
       undI eachProp(registry, function (mod) {
       d = true;

  eachk for a gr.
 !init(p   }

     stry, fun

            return {
 t support in browsersion each(ary, func) {
                                                     &&"ction              ||"    w for a require configto map confi  op                 this.error = err;
 a s});
   _tar      baseUrl:     ed: true
                        });
               , requtAlt) {
                    });

                    load.error = bind(this, fun function (err) {
                            this.inited =     if (mapValue) {
&& xid: mod        active;

 ring.call(it) === '[object Arra                '_unnormalized' 
    function each(ary, func) {
  function eachReverse(ary, fuName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hase(mod, ||               hasundI //that moduleName in fI                   has       ;
                                    //fr    * the first path segment, to help wi@licKEYWORD    "
          ack,
      h a pointe (baseNam[i] && registrydoath, e.startTionError(err,or !=  cle, xpcUtine:  baseEle            try= tru       void       ging    }

            _ATOM    ndefi              }

    RESERVED_         a    act {
      by  eahegmency IdouhFalenum regulaing'endsefine
 float g;
  //so ng} [pam     i     terf: far log       packagadediv     1;
ec //orublicrts.rt, kee    us;

synchronizync(pitoryrowsng) nsi    voam;1le    "
        if (hasInt    //Transfer a              if (hBEFORE_EXPRESSIOlize Error(mne: egistry o    th, error;

               global that ex                          useIntglobal that ex           use                               if (h     config.config[mod                if  }

           asInter                       asInlative
    OPERATOR_CHARnfig[id];
        All Rights "+-*&%=<>!?|~^", applyM      _HEX_NUMBEere /^0x[0-9a-f]+$//**
 * @licRE_OCT             [0-7romTxt eval for 'DEC            \d*\.?\d*(?:e[+-]led: ' \d\.?|ailed)\d*)?mText eval fo        nfig[id];
        [          e, xpcUt              n only" end      istr;
  ++;
  --       }

;
  !;
  ~;
  &;
  |;
  ^;
  *;
  /;
  %;
  >>;
  <<                      =     ive ==true;
 ive =!       ive =?rue;
          -     /     *     %ive =  true;<tive =  a depe|     ^     &      f (has|"there is  theWHITESPACEreturn onError(makeError('fromtexte \u00a0\n\r\t\fdule0b\u2     180e     0     1     2     3     4     5     6     7     8     9     a    2f    5f\u3000             PUNC              try {
               r('fromtexte[{(,.;:ame);

           eturn onError(makeError('fromtexte[]    , value for thisREGEXP_MODIFIErn onError(makeError('fromtextegmsiy             UNICOD at  baseName l, faction gntext.("[\dule41-since5Asince6the plu7in's nAin's nB5le,
  in's nC0he pluD6  //co8he pluFuld beFsome w2C1 with 6g withDno patE    //2E4nts toCnts toEsinc37    //37
    37uld b377parentA/refereDparen8 paren8some w38in's 38     38E   pluAno pa3A3   pluF     3F7he pl48no pa48path.
523  }))3the pl55uld b559  coname is 58Name'5D    //5Ein's 5Fthis);
F2sinc62the pl64in's 66     66Fap.id7uginMapD

   6D     6E    },
uld b6      6E = pluFpath.
6F     6F = pl710      2he pl72      4DRegistA     7Bno pa7Cpath.
7      7F
    7, conf7Fin's 904he pl93ext.e93     95 enab95some w96no pa97t the mthis.97Bing th7 = pl985ing thd(map.98      9 menti9e, loa9A8 to thpath.
9B mentiBs enabB that 9B    //Bet flaC     9Dso thaDet flaDF      Et the F mentiFno paA0      A0in's A0 = plA  enabA1e, loaA2e defA2path.
A3still 3this.A3

   A3     A3uld bA3o.
        /A59      5     A5     A7dRegisAence tA       A8     A8advertA9      lls to Ahe defAned calAbacks
A      ABing = Bch(this//for AependeAD      E       no paB   //wiB0     BepCounB  enabBbeing zBro.
  B       B     tBis.enaBling =B3(typeof     /BSet flB depenB5d to a advertBat theBmoduleB8y need       Bgin.loBame, loBiate cB9dRegisB9     B9onvert9is mod9depMap9     B9=== 'sAy needA
    BAsome wBable,
BAle.
   //for B      C   //wiC depMaC0me, loC  enabCedRegisCro.
  C       Cling =Cs to beC     /CSet flC5ap),
 text.eC6his.maat theC       Cd(map.Came, loCiate cC       Che defCned calC     vCr id, mC//for CependeCD     C      C     iD   //wiD depMaDs.map :D  enabDedRegisDro.
  D       D     /DSet flD,
    Dat theD path.
D      D       D9uld bD9     if;
    DBe, loaDBB this.

         //DCuld bE0the plE     tEis.enaEling =E4    //E4r(this      E8      8
    EginMapE8e defEgin.loE.depMaE9      E9      9le eacE,
    EA;
           E = thiEA      able,
EAdepExEAmap.idEbacks
E      E     vEorts[iE     //EC    }
er(this not tEigger F0 enabF  returF4Name'F4le eacF6     F     plF8depE100    /102in's103 = p105;
     5    105path.10
    10at th106

    6uld 106me, l107 ena107     10     108    10A;
     C

     this)10e;

 10     11);
    1text.11      11Athis11      11F     2);
    24e de124      24     2     })2    c12     12       2      26 = depM     12     }12.depM129 = depMbacks12BdRegi12     12B      2B on(d2C//SkipCspecialrror',2C like 'ould 12 some 13  ena13edRegi131modul31     //gin's138ind(th3t imm13pMap, '3.enab14);
   16     166      6e par168  //imp make16pMap, '6     17);
    7 depM17s.map 171     72    if 3rs, id  retu175rs, idd = reg7ortant7) {
   7      7ady ena7     17DName17 not 18) && mo8tName18ady ena8he de18able,19);
    91     9     })96     9 //ref19ence 19ady ena9A     9C  //im9C    }A);
    A1ar def (type1ncy ne1B4       4checkB8e, lo1BAlso, BA on(dBAed,
 C);
    C;

  1C.map.i1C4on (pl       C     1D);
    DBed,
 E);
    Fl enabFe if itF1= getF) && moF4d);
  4             F     })F5    }F      F5checkF      F       F = getFady enaFBat isF      1FB     FrequirForts', F     1Fh that1FC  }
  bind(thF     1FD       D conte wants1F     1FF      }      FF            20modul20     20      209
   210this210Name210path.211

  21l ena211le ea21     212e, cb)2uld 21ro.
 21      212];
    adver21     213C       : fun1rop(th214cbs = 4    21d wir21     2luginMa2C2     C3      cency
2Cd = re2C] = p2CginMap2d = ge2Cady en2Co
   2Own(reg2D2his.eD(cb);
 D (thi2D      Dion (na      2DpMap, 2DAction (some 2D, fun2DBcb) {
 Bction s like2Drequi2] = han2ler(th2D
     2Dcies 2D this)2Dould 2D some 2DpMaps2Ery[th3    hat tuld 30      30true;303depE303    3e the p30     309map.i30,
   30      3is, th30Fhis.e30     31   //w3      31ler was1  on(31pMap, 31BName31      31odule 4depEx4D     4EdepEx9FC

  A();
   A4d(mapA5       6 depMA61is.even1 = pA6     A62depEA6  retuA65      6dRegiAinMap.A67adverA6nt +=A71);
  A7      72

    7     A7.checA7elete 7Fing,
A80no pA80e, loA8the eA80le(arg8h theA80his.eA82thisA8    }
 87     88

    8     A9     vA9     A9(cb);
A9;
   AependenAero.
 AA    }
 A4) {
 A4     AA.plugACdepExD7     F
      FA     FA(cb);
FA6in'sFA //refFADext.FBnction Bor haF) {
   FB1NameFB     FB1adverF      F       FB     FB3some FBove
 FB3    FB4 enaFB4no pFB4    fB4
   FB4 thatFB;
   FBD //Fav);

  FD     }FDt immFD      FD //a FD      FDFdepEFEnc, namEence FE7where
E     FFluginMFF3de, fF the pFFgin'sFF6where
      F       FFde.detF      FFC     FDwill bethis)FFD       DC]" {
        non_his c(obmarkarentName here sinc3);
   03] = pl4Maps, 04ginMap,9ble(pluorts[i5try, 05 no pa5Cthis.5      5rror'05 //a 0e];
   061[plugi4ing,
 6ency
 6     06false;06 not t6nadvert6o
    6EremoveEe def6En () {
E     lers, 07(cb);
07s[plug7A that 7backs
7Eing,
 7F

   81 that 81ext.e81ing,
 8;

   82      82Name'82le eac8     0
      09 {
  09ove
 09 the pl9
    09     095ent} ev;

  096  * @p6

   9      9   }
0       09      9C   * @E  * @pEing = ed.
 0A   * @Aaram {AtList0;
    0A      At
    Aame, fuA    * Ad) {
0Ae);
  AmoduleA7rue;

      A      A functAon getSA   nodA.removAC Firefa(evt)A{
    A      B//Usinee att0Bnts[n0B the plment e0B    * B    coB}
    B    */B      B', 'e0Ba(evt)C3       addEv0Cewhere0Ct
    C      0C    * C{ObjecC    coC}
    C    */C functC      Cer(thiC     0Ct.srcEl{
    C      D the plDe.
   D    * D}
    D    */DCin's Dful to0DDhange'ould bE && !0E3.depCou If n0E4);
   E     0E;
    EB.depCou//for E.depExE functE
     0Ea(evt)F1e defF  * anFtrue;
F3           /FginMap;F7     this);
0F     }F      FginMapF      0Fnt += F;

        }
0Fer(th102      0     103n't ca0ibute10     10 If n10Set f10hEven10      0      05 {
    ,
   10ginMap10hat is0     108

         10      09dules3     1ledRegi171);

 7

     73ining 5keGlo75pMap, is en17     17B);
  17orts[17
     7Cle ea17ling =7igger180ing,
180             ) && mo9)) {
19 list19ro.
 19is.en193.lengt9ed, r1Ar det1A node1Aap.id;Aoning 1dency
1Ahem noA}
   1A6      AortantA7aps, bA7matchede surme) {
 1B0 eachP itemsB3      Bfined ee att1B
    1B6     aBd.
   B8d(this      BAany reB = th1B      B      C2his.e1      1C     1C      Cbind(thCD     CD     1i] = d1CEany reC     1Cn eve1] = han1D     1DF      D     2 bind(t20 not 20     20E] = []0
    2CE      C     2D wants2e(args30      30w that epMap30 makeAd] = pA6ous dA6     A6
    A6     A8 {
  A8or haA80     8args[08     A8     A8 wantsA8Name,
92 thatA9     A9      A9d) {
A used iA9     A9(makeMo      A //forA  funcAAers onAAbs.puAA && !Ahis.enA true;A
     AAer coAA4ue,
  backsAA speciAA     AA arouAAB[1], arequiAAtry, AA no pAB

   AB     ABn eveFB1 whicluginMaFEepCouFE) && mFE26    if (ieNamhis f{
  buireT              node.detac9 + ar09ement;
9      9       9p: ma09  retud,
   09d wire9Bject} ct || e  //a 09easy e9CdepEx9.onScr9this)0Aaram {Aement;
A      Ad wireA */
   At || eAC, handnctionA.onScrB   * @' + ar0chEven0/addEv0B      Bt
    s.plug0Bt to iB     0Brequi0B      B no paB
     Bh that Beasy eB       B       
     C);
    Cfg.basC the plCe.
   C      Cd wireC(cfg.bC     //C      C confiCeasy eCListenCnctionC     }Could bD   * @Dfg.basDement;
D      D     //Dt
    Dhe listDt to iD.charAD      Dd wireDCadvertDctuall       0DD(handl this.Drom itFUrl) {Ftill mFine() 0     102     0 && !m0     1red, r1move
 10ap.id;0      0;

   106     t6      0e each0d wir10     108e,
    d(map10led,
 0      10duleM17     17 */
  17rror',7 //a d7easy 192aps, b9     19ers on19ig.shi9r args9 && !m93             9evt);
1      1gure: 19slash1Aents[n1A1) {
  ;

   A      A     iA    *1Aths: tA6      ArocessB0args.lere id, objs B3      ntList1ner co1ment e1entTar1BalReq1B     1B 'def1      1C2     //ig.shiC itemsC     ipMap;
1C thisAemovesA8     At listA8     A8     A8      A8      9get pA9perlyA      A9      9     A9     A9.depEA9Bmap.iA      AAry[thA      Abling AA itemAs sakeAA7     B     ABo
   AB     AB/**
 ABE defQB     ABE     if (ieNamconneis l_p    u for a entName here since     2      20addEv205      ling FE itemFE.map.iFE     FF3F]"  //premalizedMod = ge(ary, fac    //ction () {
         env>= 97eInt  env    22avoreachProp65fg.shim, fun90on (value, i170eInt       .g.shim      . It isorg/CharCode    //unction bind(obj, fn) is_digit) {
                    eachProp48fg.shim, fun57 (isArray(value)) {
    alphap ? thi_    ) {
                                   || (cfg.shim) {
   (isArray(value)) {
    uni     for the contexquirejsVars.reqort jusalize the) {
                 t bo||         ation for the contex value.ex        if ((value.exports || valu         config[provalue.exportsFn) {
                              shs(value);
                                    //                   !           use  }

  && /^[a-z_$].
  0-9_$]*$/i       }

 config.shim = shim;
              _4:sw=) {
                    eachP    6on (value== 95 }
                        if ((value.expor  each(cfg.           return gsegments.
 c' fail    ed: ' to a path.
          each(cfg.packages, fu}
                }
         8204                 var lots || value.init) && !valuebrand new object                 shim[ies) {
                    each(cfg.pa setTimej === 'string' ?
     */
    fu    var req, s, he  this.dep require confige = '_'      rmedkgObj } : pkg//context or how to 'comp      i/
//Not ction newContext(contpkgObj = typeof pkg        A    a/context or how to 'compwhat 'this' will 
    if (typeof require !     _js_) {
  (nulName: origin10-2             (cfg.paumnavigator && window.*
       Inrmali;

         16th to reference th so mai + id +
  e normalized,
                            //and remov1), 8trailing .js, since diffe          e normalized,
                        F //Pmalizion mixin(target, source, forceJS_     _xp = /(    gas onne,trin,    \S]*?)\*\/|([^:]|^ || 'm}
   || 'me it is a confit
   odulncurrDirRegExp, 'ring=trine it is a confi} ba=          if (normalizedMod   if (fir) });
       xt = tin: (pkgObj.marn rhinoContext.evaluateStringrequireModuleer a Java/R        .    (pply(unctiop, '')
  + alueodulefig
    ring     pone nfig
    } baalize  }
\n\n                     malizedMod = gejs_normain || 'maileFunc !ain')
                               iin: (pkgObj.main || 'main')
            (isArray(value)) {
    alize(alize,= tru  function newCon1; i > -1ken.    re      ithou     e via curr eachP });
    (it) {
      pkgConfEX_EOFp];
    }

m;1']
     keduler($TEXTes in the j === 'string' ?                         too
;
         r\n?|[\nmplet   co29]
   "\n"                F        if (ieNam      Func !:s in the rck = errback;
;
  0sure it is not okap.unnormalized) {
 pply(undefined,d) {
    pply(unormalized) {
      normalized) {
        }
              new    that th: true,}));
          .indr moowentMy or a config callbal name that th: [              }
               eek         }

            S.reak;failed:S    
            //Do not          ext( + 'al_eof,
   g.pkgsed: true
           ;

  as a
              ++this.events.error)  is loadedfactot both    alreadevil: true */
    .make  //si
            returnS.//If a deps ar cfg.      makeShimE|| !               '_unnormaliz++S'')
       '_unnormalizS       
              eractive = false;

    fun fn     .replace(i = ary.length - 1; i > c           object before requih re(wha   }is loadedror', errback);
     fixReas a
  putStrea             //config   context.require(cfg.urn r= -1s || [], cfg.callback);
            Exp, '')
   object before requi4:sw=                   },

S.ap(id); ret               ns) {
                            {
   urn ret     },

            makeRequire:      /ve changue,    al nameelMap, options) {
ack is specif            Matched[ifactoUNARY_POSTFIX[     ] id)     if (keypresenabl             req.exec(textncti errback && isFu conenabl                  //Bi      can be traced for cycles.                //wy,
          //since they wilmakeM       to 'complete' thpply(u{
       f (isFunction(call     ons || {f (isFunction(callap.unnction lf (isFunction(callseName          return onError(nlb    //If a deps arf (isFunction(call    f (!mod.in              his.events.error) {   var id, map, requireModnfig ob(filname that the;

    get the
    
                    v get the
       suffix,
            lugins that may ense rested, get the
    rict.
/*jslinlen the MIT or new Be value, it willa rethis oa re||his only works while  })nlb{
                            text = textA            makeShimExpor how to 'complete             name th) {
                if (aeRequire: kip_ble this frelMap, options)       ie
              (ful wh))ire.js              //Synchronous acread to le(n;
 *
         * Trims the . avaluehop)) {
                    i     eful whcessan;
 (get) ++      elsevailable (as in ll become
         * the first               //Rexecuteen a web page.
    o executeerres in the re {
       //Invalid          ble (as in the Node adapter), prefenumt.
 fixed: true
           has_= 'undefi, af      id = map.    
              dption           . original error the}

 thisefer that    }
   get) ed') {
        //If a def{ name: pkgObj } : pkgObj;
     configura        {
             turn {
        120 prefix: prefix,
   rror(88 prefix: prefix,
                  ?     i :         
    i +
                      01                '" has no69been loaded yet for context: ' +
               e                   id;

                         contextNam45been loaded yet for context: id;

   }
       factortrue)                     return3defined[id];
                    }

                contextNamid;

            46been loaded yet for context: !(!hasProing,      oaded.
 )));(!hasProp(equire(or how to 'complete' th(ary, func) {
        if (ar
                      {
            e.originalError {
    rue);
             +/req {
               vali      //Remove leading d             //If reqNa     id;

            return        each("nu         rt;
                    if (value.init)            /"In      syntax      fines();

               * Given a reldapter), prefeescaplug                     if (cfg.deps || cfre.js    .
          ;
            t         pkgObj } : pkg            },

        1                 '"global) \n"                clback, 4rrback, {
                 r          enabled: true
 all the dependencieglobal) 	          enabled: true9 been loaded yet fo         b          enabled: true
       return localRequire;
          enabled: true
02     return localRequire;
 f          enabled: true4      return localRequire;
 0          enabled: true
                  '"efined a                   hex_    s(2if (       enabled: true
 7an URL path.
                     * *Requires* the use 4f a module name. It does errback, {
                          enabled:[i] && an URL path.
            .apply(globafunction (err)           //call f* the use                            
              @retu;2, Th */
ameParts = splitPrefiin, s                /kipMap = any trailing .jackage configs    leNam)) if map config should hex-fileObj =, PackagebaseParts if there is a base       }

 << 4 |uleNamre is no default.
                wollect them.
            ar            =     adedp configU mod     ed                requ   err.requireModules = [id]quo     vailab,   if (redexOf('.'),
        ;ed') {
        //If a defMod.skipMap =null, noLoads);
               \
            },

    
 * @licoctal_ense r0es inorm     /* this.exportsackages !=          return onError(tring() === '[object Opera]'       >= "0enablc     "7   moduleNamePlusExt = moat part.
      r.splice(i -      relMap && relMap.id, string(0              vaen loaded yet for context: ++NamePlusE prefix = nameParts[0];
  fine
        //stringeNam3enablNamePlusEx<=     eachPr                            rmal4turn hasProp(definad, baseEl            defined: function (id) {
(ary, func) {
    browsers, #392, and causes           mod.emit('error', err);
         /amePlusEx The || cfg                            get)8)) relMap        }
pendencies.
 t.length);
            
        //           k;
                }
    s, relM              var ext,
   odule(makeModuleMa(this,      .
                      //call for def a dm the srelMap, options) ap, localRequire);
  transfo      //si                            }
  uireMod = getModule(m ret || (v

     & getGlobal(value.ex  funcurn ret || (vright (c) 20                 if (value.init) r #408
            setTr('req             /^compleue();

  = isBrowser && ary.length - 1; i > -1uleMam the s1      ,ffixRe     //dots from a relative pmultion (id) {
                         if (indextched[map        Relative || index > 1)) {
       //Bind any waiting define() c*
   t.length);
        rmaliexMap, true),
                            mod ize(pntex     the MIalls tnot b                 var tOwn(regine/t                      = n val                      1)    var ra[     = g[part relMap   varlse .defined) {
    handlers[deps]       g a different con      makeShimExports: function (valu|| (value.exp  }
  ow err;
    }
            delete define2Holdrop))t.length);
        if (plugps, relMap, falamdule. If require.gmalizackslas     = map.      (req.get)pendenc       if (e map;
                     return re!de.js
        fs = //Allow plug
         }

    function isArray(it)                      
           ap = ovailablath, exec,pkgObj = typeof pkgObj)     }
lMap, loc)) {
 ill break out of the looractive = false;

    functi parent!= "u"e = segment ===Expt.geng Us || vEendenS   check-- uXXXX if there is a base             }
pendencies.
  nameParts[1];
        : pkgObj.name,
         ethodif map config enable                    requireo con                                         var mod = is overt,  true);
             
            },

                           return handlers[dep10-2        if necessapendenc            //fix fohe
        kgObj } : pkgntext.eva(16* loUpper {
 ap.id);
                    \\u     0leNa        hex);
      +ynchr                     t is not the
                     prefix = s from a relative p                             if (indexregula given
        ative ||       ror', errback);
     rev_
            },

  get) n_      p.id]);
                   iNamePlusExt.len      },
                       //fix for index   p\\);
   f (name) {
        ,
                   t;
                   parent, th[
            },

    orts = shim        });

         ngth) {
             args   });

          "]enablorts = s) {
                        arg  id = makeModuleMap(id                     //If already found an a.init(e) {module and bound it
                for (i = lready found an a     moduleNamePlusExt fQueue.shift();
         });

     map = makeModuleMap(id, rel                   //If ae.
              mrt =            r
                     delete        is tName her      es;
 .') {
                   }

           this.loa, true);
                       nrow(e of isOpera for reasodefineturn re        
              nnormalizil
     opary[ul wh                              e(      ;

            return {
 ap, localRequire);
 h.
            e;
  ycle ofction for iterating over an array backwards. If      callGetModule(args);
         return handlers[dep === moduleNamMatched[i]se cal        //nailab          url                   andle_                 if (mod) {
                  
               ;

            pMap;

                       d.init(deps, callback"/  prefix: prefix,
 rom the special hisDefiunction (id) {
               mod = getO
               ))) {
                     lue. Should
 xction (rea module name. It does"*                           return;
            tched[map.url];
 } else {
                            return onError(makeError('nodefine',
                 ry, id);

                                       ?            MIT ]) { script!
     inS& !mod.inited) {
                   do                       //Bind any wait                
            requireMose {
  lse,".      deleteuireJ,id))ble (as in the Node adapter), preferordrequireModules = [id]              } else if (args[0] === mo    if (hasInjs))    c delete plugi         !e a scrip },

          t the s        fter the c },

          Prop(define         deletenction(c     * & !mod.inited) {
                                        d, map, requireMod       */
     ();
              \/|([rytry.
                mod = get cal {};
            fine
 ack,
 (e            * it is a        chro==, cfg.c    getModule(          by
    g, id)) {
                            tex& !mod.inited) {
                       forcrequg.shim, moduleName)      r paths, pk in the re };
     
         ar paths, pkg;
            tess to one modul;
            tfunction (re  //module will be    return his.events.error) {     === moduleNam    ates a protocol is ule name "' +
                                    id +
            rror(3                 nds wi               (relrl,
                                       all the dependencientext: ' so just siule id.
               ot support using
                 if (co
            var i;
            .location;

   url,
        lse,t is just
         
                === moduleName, (shi&& mod                           returno just return         //A s     //Add extensio         ion (     each(cfg.packages, f url,
              
               getModule(depe     * @pnt === '.     cdo no'deps || []), shim.expo              se the
  this.on(cady have a property         nc          //the call er moduapped to a path.
                   //If module BuildCaREFIX,
                         [id                  
                    i           //resourcBuildCallback,
                   = module    //resourcASSIGNMENT,
                                       //Mark this as a dependency for the plugin
            //resourcPRECEDENC at        e.reqype,
anspiler plugins that may not a th  * returns a tr, ++x = moduleNamePlusExtf (r    dexOf('.'),
       e.split('.'), f;
      rt) {
 akeModuleMap(id, relM[b[j       defined: func       * Given a rel };
        }
   ([ [       ter ow th      ;
       ^
                
                             useInteractive = true;                                                             ve) {
       ]    {   exports =STATE    S_WITH_LABEL    ole = {
      [ "f      dent)"r thaaram essed) there is a paTOMIC_START_TOKElizesArray(parentPath  /**
 ap(null {
       me) {
    name tthere is            //Rs too
  leName etOwn(pkgs, leName Requir\s*\(\leName             ) {
   i    y or a config callb       if lize rmalized) {
   e.
               //If mod            true,
                    late to modify them, ainpurn k on at too
d, id(this,         it is too
  leName            gnore uormalized) {
    eop]          //If modfQue       pkgPath = pkg.eekentM     pkgPath = pkgiap = confi }
              in_me, used to ap =                  a s                 m    suire with those args. Th{
    the coilable (as in lue)) {
                   foundMap, foundI, f                 have chang                    delis is useful when require is defined asin;
  me)     parts ortsin mo       //Add object before require.jselMap, options) {
fQue ret | config.pa pkgPath, syther, th            },

              ther, th          mod = getOwr, then    /* this.exportsr. Not shown here to keeprl) || skipEgure ou
                        }
 \.\-           en figu                rl) || Prop(regi              ame, (shim;         ire is defined as );
           ted) {
            fQue           //Join the path rehe tragedy, error ID that maps ]+)[/(\/\*n')
                      .')) {
   
   \.\-]+:   } els/) ? '' : configo execute"\/\*ctxpkg.name);
     in the  ?am {St:on to.
       ringallow overringg in the         .
         (id,g in the   map = makeModuleMap(deps, relMa   ((      /       ms        if (cfg.dgs) : url;
 eachPn')
                                 }

     u         
     //Defaults. Do not se      de.js
  ) || skipE');
                       },

       
                       eachProp(r contin the rig;
    alizebe just an URL.
             *             /ve changed.
         {
              execetOwn(pkgs, parentModul   paths/) ? '' : config.baseUrl) + ur        },

                    * laye in treturn config    «
                 *
 »     A reg      nction trimDback fo    , used          * @private
             */( con    foundMap, foundI, f    */
               even                 config.urlArgan_insert_.split('/         }

            !me === p } els     return cp && ha+
  a filurl +
          }                    makeRequire:      onScriptLoad: functiame, ca             is passed in for c!  */
            onScr)arate functi* that was loaded.
            namePhesiso suthis.depMaps = dep the"(ile, or if it startsndexOf                  }
          == 'load            *browser for th         * @private
          mblugi    sed, id     foundMap, foundI, f         } else {
                  e, paem to sequence the fi              opctive             //Do th     n     : '&'      '_unnormaliz    /If e, paf the  //Pull out the name o      en'' : '.js'));
     ser for th Can happen if tnction (moduleName) {
            = //Reset interative || index > 1)) {
      tm
              ers willProp(define inStentTarg   * Callback=rted=== '/' || url.match             url = (url.cha.match(/^[\w\+\.\-]+:/r script load = {},
            urls
                       return confiFallback(moduleName)) {
(this,  prefix: prefix,
 modulenorm }

           s=4:se mod//so .pac                   //Do this ascri&& normats(name);

                     ill be supp,rted           }

          
            }

        }

      }
    t load            mod.emit('error', err);
  baseElemat                       p(nuh .js, then assume thme) {
  ring, then the module Matched[iring, then the module  plug//The slash is important r: ' + data.id, evt,gument to require is a the//The slash is important          
         , (shim:"   c     e notta.id, ev :     * If the first argument is an array, pende prefix: prefix,
 asPathFallback(d                      {
         {  prefix: prefix,
                }

 rl, pull off t
            }

                 *         true);
                       using_( {
                mod = re
          ng the text, to reinfo,
                parerror(i[  prefix: prefix,
   rror(i(     * Make a local req variab    * If the first argument is an allback, er;  prefix: prefix,
     he result
                //of thosne: isDely map config ntext, use default
    (moduleNamePlusExt) {
            //to support and refox 2.0'ing, then the module nction(cied to execute when all oftfQueu those depend        ,    

            return {rror(i
         * Make a local req variab
         //Adjon ()   */
    req = requirejs =  a point          // Adjust args if there are depende, mod.ma   */
    req = requirejs =  (baseNa  prefix: prefix,
                 contextName = defContextName;

      will
  ntext, use default
        vado     * Make a local req variable to heDo
            }

                 locatioain' uginMore that are not standardiz           l(noe script
   may actua                               d mo    onScrre that are not standardiz    on/local scope use.
     */
    req = requirejs =           * Make a local req variable to he the 
            }

                      ext(contextName)   context = getOwn(contexts, contextName);
     on/local scope use.
     */
    req = requirejs = )) {    * Make a local req variabfor_ntext, use default
        va      }
 ig = function (config) {
            _        ies are available.
     *if    * Execute something after if return req(config);
    };

           * Execute something     u      } els      tgs) : "'      'etur.pref
          ile, or if it stocal req variable to hentext.
            }

                  will be support ? lit('/loadjs
  :   */
            onScri?low ov:          (readyRegExp.tmake it easier to cooperat
        }

          context.configure(config);
        }

                  * Make a local req variable to he {
   
            }

                       re.config() to make it easier to cooperate with other
  ere i.spli_ loaders on globally agreed names.
     */
    req.|| []meout.
     * @param  {FunctiUsing curto executIllegal //If a        '|| []Name + (ext |                       }

  | []unction (fn) {
        setTimeout(uire as a global, but ony exist.
     */
    if (!require) {
        require = req;
    }

 try.version = version;

    //Usetry return req(config);
    };

 vanfig = function (config) {
    ewContva  re'undef',
        '                deps = callbacstault context,
        //so that durixt
  builds, the latest instance of the default conte     n context.require(deps, callback, errbitut dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    reqto fetch. Aon/local scope use.
     */
    req = requir in the call.
        if (!isArray(deps) && typeof deps !== '                parentPunction (value, propg names to fetch. An            //Dele      = as_      //Adj if (     //Add extensio                n                var m        e;

               
                                */
           executned =     active;

  ing.ne() modtwiceile, or if it st is a problem == 'loads if there is a b];
     isDefi        //module will berror forata.id, evt, [data.id])) require e                         ne: isDe if (mapValue) {
            }

    {
       f (isFunction(callb      */
  ;
                }
           ynchronous acc: ' + data.id, e     if (isArray(ca  //Used to filtine,
                id: (prefix             'toUrl',
        'undef',
        'defined',
    ultOnError;

    /**
     * Creere are depnabled: true
           ls in th   /* this.exportse was easy enough
           gistry
           ls in this jQuery bug:
    Refold on to listeners iload event could b      in the registry
             * auery.com/ticket/2709
        baseElemelement = document.getElementsByTagName('base'ase')[0];
         executmalize(nam      head = s.head Map));

              Function} a stion to execueasonable
ing.    in.prefad] = {onteessed)};
            th[];
            }
      Should
    yp);
    };

    /**
 */
    req.onError = defaultOnError;

    /**
     * Cre    re if (evt.type === 'load' ||
                     .org/1999/xhtml', 'html:swill be supported{
                   req.   cntextName] defa: function (fng bulQueue(:s a global, but old on to listeners i*
             * Callbacin, url) {
        var c {
      nfigory, 'one/two'     ymousitelse if (!mod+ id);
  1a module Oe itringngPathFallback = truaram     i@para..in= bin*
             * Internale result
                //of thos    in   nodName = normalize(name, parentNamef a .. will become
        _fo
   Name);

     the Node adapter), prnt first becaus if (evt.type === 'load;ile, or if it starts    g = (co4);
    } : fuort req  (readyRegExp.test((evt.currentTargetript onload firings
            //that d) not match the behavior of all other browsers with || evt.srcElement).readne: isDeFor
            }

   
     ecau                                 make it easier to   if (    make it easier to e with other
     * AMD loaders on gle name of the module.
     * @paramoduleNamn be removed. Detailh(regi node = req.createNode(?nfig, moduleName,    nc !=        //module will beoblit(he onload event for a
            //script right after the script executiIfunction (fn) {
      //https://connect.microsof   if lh    return onError(y
      ed aad-event-is-not-fired-immediately-after-script-execution
            //UNFOR   ifhe curre                 );
    ion       foundMap, fote$/ :  this.usi      se to     if (!no {
                         cthen sBrows jQuery n NOT find [ ?his.exports = expt(fnT natively             if (!not:                     //Note the t       c        or scripp(nu    cas_ntin_     An org/1999/xhtml', 'html:e toString()
          Array(deps) && typeof deps== 'load' ||
            e was ive c       e toString()
              rts, exportst the require context to f('[
            }

          .inited && !mod.m(errback) {
                ,{
              relMap &&       ixt, moduleNam)so use a script tag
      //dev.jque     string(0ndefin)) {
 == 'load,tTick = typeof setTimeou}

        is jQuery bug:literal valu else {
            unction (id) {
           de.setAttribute('data-requiremodule              }arentM     i[]only if it does not      /ticket/27ots =
       after executing the scn fn      } els      '_unnormalized' l;
                       });

         at to add allowIndexOf('.'),
  nction. Intercep !!suffix,
                l be attnd to gi      '_unnormalized' --              //It would be great to add    //4tate //It would be great to eadystate      ine call.
                useInteractive = true;

ener
    [0];
      cript-execution
          ms.splice(0, i, pkgPhat       if (cfg.deps |    ntext(contextName);zed: !!to this
   ,          ejs/issues/273
       (context && co    , url) {
        var cde.setAttribute('data-re     //tto this
     * function.  the
                    }

 IMap) {
            vt.com/IE/fet no                 //read name                 /
                     var node = config.xhtml ?
               d to gi if (evt.type === 'load{ile, or if it starts    //a normal, common casext, moduleNamfor                }

     Target inattachEvent.toString && node}

        to this
   ) ? '' : config.baseUrl) + ur                //the call  module.
     //Synchronous accr = isBrows     } else {
                node.addEventListener(,ned eq.load,ed[depIecution,            /**
  t.onScriptLoad, false);
                node.addEventListener('error', context.onScriptEe.addEventextName]      ;

            return {
 apped      ed[depI               //Pull out the n fs.
execusuffix,
                so to tie    }

     *nce (it assumes things
     * on         configs;
           ve a short
     * name for             a global, but only if it does not already      curgs.jeModuleMap(id, relMap, false, true).id;
 unexpec insert      '_unnormalized' **
     * Any errors thatfine
        //ad event listen  break node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                   head.insertBefore(node, baseElement);
            } else **
     * Ae {
                head.appendCcript = null;

            return node;
        } else if (isWebWorker) {
            r. Not shown here to keep code co!curtener('error', context.onScriptE = noderor, false);
            }
     
             * A load event could b insertion.
            currentlyAddingScc = url;

            //For some cache cases in IE 6-8, texts iparentModule = syms.ed: !!nd to giv to disecution, s.startTi/then fire the script load event listenanRegi;
                nod              //to long.
            de.setAttribute('data-re== 'load' ||
            /in IE8, node.a as being in 'intera        //Pull out the name //script right after ble to dis              out dependencies that are      *f themake it easier to coop    modId do not fire
         rdized), and to give a short
     * name minification/local scope us            //Som       /**
          ntextName]         led for ' +
                                    moduleName + ' at ' + url,
       s',
        pt execu      Script() {
        if (interactiveScript && interactiveSc{
            return interactiveScript;
        }

        eachReverse(scripts(), function (script!back,
             if executMls.get     */.startTime + s   * @param {Obj           }

  r    });
        retunstalls of IE 6-9.
         to disabback,
                 //ed = waitppend chcript-execution
            //UNFORTUNATELY varpeof(no_iaseN                     retListener('load', contexPlusExt.substring(index, mounexpec        a plugScript() {
        if (interaca require that are not standa   if es not have tf inte            llLoad" with no cl    make it easier to coopimeout(fn,    * Callbac=xt.config) ||   (readyReg },

   if (          pkgPath = pkgtiveScript;
        }

        eachRev            //Do this a    context.requir
                }
    de.setAttribute('dater for errors on this module.
   t, dataMain, ng be {
         getAtry)) {
                    a data head.insertBefore(      *                       /                      if (!hndefi) {
                minification/local scopcrosoft.com issue
     about nstl baseUrl if  is not already an explicit one                    if (!cfg.baseUrl) {
                    //Pull off the d = map.but only if it does nots the
                    //baseUrl.
              new src = mainScript.split('/');              //to long.
         = contexts[co   * Callbac])); generates will be new        (rm/jrbc.join)://ggr before load, ers will be supp(efore execute
                //next script' tExp = /         script right after r. Not shown here to keepprefix, parentName, appistener. Test attachE   isriptsk for a dNeds on global requireinteractiveScript && interacti      function      there is a base name:jsExt+ '/' : './';

                    cfg.baseU          };
     ms.splice(0, i, pkgcom/jrburke/req
            },

  oonfi         o this context,
 ct
      okdata.id)) {
                 then it will be treated as an  as being in 'interaReuiregument to require is a string, then the m relMap,Script =  leadicript() {
        if (interactokreturn interactiveScript;
 fter dependencies are loa);

    ok**
     * Main entry point.
     *
     * I
      ) {
                    return onError(makeErrrst argument,
pMap);
            }

       ecute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     *that
     * is represen (name, deps, caame her {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            call appropriate context.
 /**
     * Tependencies are available.
     *ndefintexts[defContextName];
   argument,
() {  head.insertBefore(node, baseElemefter dependencies are loa loaded shouon/local scope use.
     tions || {};

             ed'
    ], function (prop)                 callback = e argument,
   idencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //lhen for require calls, and pull them intop.undencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callbacspecified: function (id) {
                  for (i = ary.length -                 //the call                 }

            m/jrb             cont_    , context.onScrip           * Callbac  //lgs, exports) {
              w   //the error haund = true;
                //to long.
        ers will be s         //work thoug        f thellback is a function, then figure rback, optional) {

    de.setAttribute('data-requir      de.attachEvent &&
                 //Put thof the module and the context.
 eps);
         //to long.
                    }
        }
    };

    f                  mainex,recontmodule.  */
    req = requirejs = function (deps, callba                mainole = Erro (useInteractive) {
            node = 
     * Make a local req variab       main      ;
            if (nspecified: function (id) {
       Array(deps) && typeof deps, function (script) {
            req.nextTore execute
                //next script' t                   _ainScrirs. Caveat:
       uncof the module and the context.
  scri              //Pull out the n       name = nodeejs.exee('data-requiremodule');
, function (scripttPath = parentPath[return confi]gs, exports) {
            eractiveScriom/jrburke/reurely
        //tracing dependencies, and Array(deps) && typeof ) : [mainScript];

 path, fall     from (useItrad[magid) {a       /rMap)  return true;
     string(0     itener('load', context.onScriptLoad, falessed
 ;
                node.addefine call to a name.
                //However, IE reprty o    //in the onscri(conf([name, deps, callba
                }
    ers will be supp        load callback.
        (co         //Look for a ddy bance (it assumes things
     * on a require that are not standardiz
      };

 on/local scope use.
   t calls changes the registry.
                mounexpec dataMain = scri   */
    req.exec =       }
            node.src = url;

            //For some cache cases in ize(pre = data.id);
                }
            }    }
  [ require.js in it.
        each (thi     name = null;
 is.defininpath, fall ]",t) {
           ('/')                 //baseUrl.
ay of path segm.getAttejsVars = {
        require: require,
        req     node.addEventList ? context.defQueue : globalDefQueue).push([name, dese);
                node.adne.amd = {
        jQuery: true
    };


    /**
     * Exec) {
               ejs for details
 
                }
                  //to long.
                    req                //us    e,
                      }   } else if (args[0]Do not se    if (             context.rvalude, but clear after the DOM        "getPlusExt,
                     //Look for a dfter that,
 
            }

            retinteractiveScript && interactiveSc if ((this.evyState === 'interactive')     }

                ing the       this.us {
                mod = regist minification/local scope use.
     fn(defined[id]);
             a pointing the text, to reinforce
             url, true);
     s  xhr.send();

        xhr.onreadystatechange = func{
    ) {
            if (xhr.readyState === 4) {
                eval(xhr.responseText);

                //Support anonymous modules.
                context.completeLoad(moduleName);
            }
        };
    };
}());
    } else if (env === 'rhino') {
        /**
 * @license RequireJS rhino (ary, func) {
    {
                //In a web adystatechange = funcexportScript() {
        if (interactiveScript && interactiveSconseText);

                //S       evil: true */
   'data-main');
            if (dataMain) {
                //PreservCommonJS thing even without require callsechange = func     name = null;
 ctory)) {
  aquireJS rhino Copyright (c) 2012, Theript];

    ntext, moduleNa}
            },

    E 6-8 and hit an anonymode.setAttribute('datct
        The function that handles defi string, then the module    return onError(makeEes definitions of modules. ted by that string is fetched for the  // deps is a config obor the appropriate context.
     *
 se,   //MaroUrl: function (moduleNamePlusExt) {
               context = contexts[node. cases in IE 6-8, tas      return localRequire;t regexp: false */
/*global require: false, define: false, requirejsVars: false, processoaded it and set up
 * some variables. This adapter just allows limited RequireJS
 * usage from within the requirejs directory. The general
 * node adapater is r.js.
 */

(function () {
    'use strict';

    var nodeReq = reqjQuery       no                 name: pkgObachEventents.error) {
           obj, prop execut!== 'eck stat     }
    };

    fhis.depMatched = [];
    und = true;
       node.a those depend          //addEvenyile eewrue);
     
            }
  dule.
)bly IE. IE (at least 6-8)pMap);
 those dependeck/details/648057/scscript for the page
          t the text to execute/eva    if (pluginMo                //the call sy      //dots from a relat       mai            hildurely
        f (prefix) {
        the moame of theainScript.replace(jsSuffixRegE.xt')];
            }
        }

        //Alwa              mainScript =Doaded and evaluated. HoweinteractiveScript && interactiveSchild(node);
    make it easier to coop context.Mrequirejsreturn interactiveScript;
        }

        eachRevurely
        //tracing dependencies, and allo   context.r[xt')];
            }
        }

        //Always sor duire', 'exports', 'module']).concat(d    }
  ]   fn();
    }

    //Suppl       mainScript =zedName) + suffix
        duleName = moduleMap.id;

        if (hasProp(context.defined, moduleName)) {
    or det = context.defined[moduleName];
        } else {
            if (ret === undefined) {
          ely
       ct-compliant.
/*xp, '');

                 //If mainScript is sextTick = syncTick;
          ains . or ..
        moduleName = moduleMap.id;

        if (hasProp(context.defined, moduleNam   });path, fall bacet = context.defined[moduleName];
        } else {
   ype = config.scriptType || 'text/tScriptData(evt);
   
              maybe_nce.
 se exports, and module. Avoid doing ex   //REQUIRES the function to expect the Matched[iviron                     //or')];
            }
        }

        //Always sequirglob true)//Adj    contexts=4:sw= = deps;alse, true), and module.   //Pull out the namof the module and the context.
   llows multiple modules to be in a file         nameToUund = true;
                    maely
        //tracing depe        se {
                   llbackoduleName === "HttpR  };

    //C    //since they wiln thntext, moduleName, momanage       ig = deps;(it) {
        return Oh tf the module and the context.
 Oh tn IE 6-8 and hit an anonymous d')
                mainScript = dataMain;ect and calls nction (value, prop)text, moduf('[Name   datop) {
        return(llow oe if ||    
   --      requ      e, s   }
 a module  should dingof case   }
"pMatched[i Dojo Foundation All Rightrobably IE. IE (at leasthis.load( to handle it. Now thild(node);
    /jrburke/requirejs/issues/187
          //co func(ary[i], er to min_precpt.getAt return true;
           will
         ?s get of a modquirejs/issues/273
      turn reinLHttpthere i     hen fire the scrip|| {},
 offontModule, ?it.
       [opp]) hen fire the script lo  con +
     q.get(c >ves later')];
            }
        }

        //Always sct is spy so
  (            ')[0],
ater executi     var data = getScriptDatamodule to helire(t     name = null;
        }

      tiveScript && interactiveSc      er tove comments from the that it gets the requirejs
               || mreturn interactiveScript;
     vae           } else {
   es later executiCan happen if there
                efare multipleglobal queue, and get itop   if (nt from the browser for th moduleName, url) {
    ay n       'for mod       //Set false, t.com/IE/ ?
   eUrl if there is not already    //REQUIRES the function to exp        int
            co        /**
             * Callbac?xt')];
            }
        }

        //Always sy     evil: true */
   k = context.nextTick;
    s if there is a base 
                 );
     Script() {
        if (interactiveScript && interactiveSct.com/IE/fecontext.defined, moduleNam itself, andye              cfg.d           //node dataMain = script.getAtreturn interactiveScript;
  ul wh }

        eachReverse(scripts(), function (sculeMap.originalName, relModuleMa deps: value
  req.nextTick tion newContext(cont {
           ict support in browsersplyMap);

                  ,

 /context or how to 'completedFileSync(ude = req.createN //"shim" d||ting it
                   ts = req.makeNodeWrapper(conte             try {
                vm.runInThisContext(contents, fs.realpath return(contents);
      there  are ous get of a module.
    req.g } else {
            ath
       i, a
                node.addE            but t callGetModule in case the result
                //of thos    prefix + '!' + normalizedName :
     ate === 4) {
                eval(xhr.!config.suppress.nodeShim)) {
  {
            vad call
                              map = has.map,
  e a short
     * name for minification/local scope use.
          //Support anonymous modules.
function (fn) {         intNode;
        }
    }

    /e);
        }

        if (existcally so             try {nscris execution.
    req.makeNodThisContext(contents, fs.realpathSync(uriginalName;
       only non-.js things odulct-compliant.
/*equirously.
                        localRequire([modu map.id) || originalError = e;
                err.moduleName = modulble(             err.fileName =eckL  node;
        i  } else {
            def(moduleName, function () {
                //Get the original name, since relative requires may be
   ntextNa call normalize on t                //is used: functione depuire("' +
     o that          //is usede calls, but still
           on (re === phild(node)ontents = fs.readFileSync(ueadyRegExp.test((evt.cPath = getOwn(patative || index > 1)) {
      ThisContext(contents, fs.realpathzed: !!suffix,
        t.onScriptLontListe    isDefialse);
            }
                       //Pull out trmalize.
        req.exundationrentMap = map && mundationfor map
             ndation
          * see: httArray} arizedName = normalize(n/github.c              var data  which
                //wndation Alhem into github.   });
        return interactiveScript;
    }

    //Look for a of IE 6-9.
         Name ===  Detected ' +
        
                        }
         Reserved.
 * Avaiunc) {
  xt);
 efined') {
            cons
               '), err            origin           ight ly be done if t
     
             //value fost try   re       {
                         ;
        req               ontext.                   i = syms.leng          this plugin, so it
                module n("ction (na= getOwn(contw!headed
  or = bind(this, function,him = getOwn(con\/|([w
 * see: h            //Do this atwjs as t)on (eks.
     o baseNlugin,      * Loa                      the too' && (!fileName || !n newContext(contewscript  //we cannot tie the anonym
           } else if sh(normalizedMap);
is.etw nameParts[1];
         ractive = false;

    function isw[], funce */
/*in, loadedOptimT or new    this.depCount = 0; * see: http://github.com/jrburke/requirejs for alsetp://s Reseris.e     /**
 * @license Copyr/require.
  yon]';o' && (!filquirsing the text, to reinforce
                        //f the opt                  t || getInt      }

       * that was loaded.
           do, fall    .com/d,
                   o fe    en //application in normalize. The             ction (nam*
  ype = config.scriptT* that was loaded.
  _//Adjust dule (this.eventsess.ve if (mapValue) {           }ele.ty = 'unknown';

  ized ls in theof naviga';
    } else};
            thrmalizetor !== om/jrined' && typeof documen== 'undefineess.veowser envs.
     env = 'node';
    } else if ((typeof nexecute, 'undefi         (typeof importScripts !== 'undefi getOself !== 'undefined')) {
        env = 'browser}/,
    ';
    } .com/jrburke/recripts !== 'undefi
       env = 'node';
    } else if ((typeof nProp(regist  return env;
          (typeof importSt !== 'undefined') ||
            (typeof importScripts !== 'undefiF    env = 'node';
    } else if ((typntext 'unmpleme  env = c       }fig, ined' && typeof document !=      env.contextNam return env;
        },

        load: function (name, req,      enveChild) === -1)       }ptNod load: function (name, req, load, config) {
            //Allow override in the config.
     Itorynv = 'node';
    } else if ((typeof nonfig =  env = creturn prefix + env + '/';
             , funct, []).pined' && typeof document !== 'undefined') ||
            (typeof importScripts !== 'undefiturn    }
            });

            req([or('Tried loa new BSD licens      }
    });
}());/**
 * @license Copyright (c) 2010-2011, The Dojo Foundation All Righttext       if (config.env) {
                env     caict';

   e.
 * se    re        (typeof importScripts !== 'undefi                  if (config.env) {
                env       eof navigator !== 'undefined' && typeof documencripts !== 'undefiIf     get: function () {
            return env;
        },

        load: function (name, req, load, config) {
            //Allow override          envles.
        ;
        },

  e.
 * se           d        (typeof importScripts !== 'undefinere iserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details       env = 'xpconnect';
    }

    define('env', {
 t Function]";
        },

        isRegExp: function(it) {
            return it && it instanceof RegExp;
        },

        hasProp: hasProp,

        //retTryomponents.classes && Components.interfaces) {
        env = 'xpconnect';
    }
          envo not bogiven prop ned') ||
catch.transform(tw);
 s 2.1.8 Copif (self.bfinally) t (c) 2010-20 =2, The Dojo Fo
 * @license r.js 2.1.8 }r.js 2.1.8 _(AST_Catch, functionht (c, tw) {js 2.1.8 Copyt (c)argnameundationburke/r
 * @license r.js 2.1.8 Copyt (c) odounddo_listht (c) odysee:  * Available via the MIT or DefiniensesSD license.
 * see: http://github.com/jrd * in eithscript to allow is modifieding RequireJS in the command lineVarDefSD license.
 * see: http://github.cright (c)value12, Thethe rundationthe rhts Reserved.
 * Available via the MIT or Lambdaely enable this file. It is
 * the shell of ke/r12, Theke/requirejsr details
 */

/*
 * This is a bootstburke/rd by the top-levese, requing RequireJS i a bootstrap script to allow running RequireJS in the command lineCallSD license.
 * see: http://github.com/jrexpressionundation args, rea: false, java: false, module: false,uirejsVars, navigatojs file to inject other files to cSeqSD license.
 * see: http://github.com/jrcarundationcartails
 */

/*
 * This is a bootstcdrNode, Cc,dCi,
        version = '2.n the command line
otre, define, xpcUtil;
(function (console, args, readFileFunc) {
    var fileName, env, fs, vm      nodeDefine, eubre, define, xpcUtil;
(function (console, args, readFileFunc) {
    var fileName, env, fs, vm, path, epropertoundationed' ? re     rhinoArgs = args,
        //Used by jUnary        useLibLoaded = {},
        //Used by jslib/rhino/args.js
        rhinoArgs = args,
        //Used by jBile.log('See https://github.com/jrburke/r.js leftundationypeotails
 */

/*
 * This is a bootstrighof importf !==hts Reserved.
 * Available via the MIT or nondn eitaire, define, xpcUtil;
(function (console,cile = fuNode, Cc,ile = fui,
        version = '2.1.8',
    onsequenof import (string) : false, java: false, module: falslternativrequirejs    exists      rhinoArgs = args,
        //Used by jArralog('See https://github.com/jrburke/r.js flementd by the top-levealse;
  ing RequireJS in the command lineObjec
        useLibLoaded = {},
        //Useed' ? riquirejsVars, navigargs[0];

(typeof Packages !== 'undefined') {
   Pd' ? reSD license.
 * see: http://github.com/jre.
 */

/*jslint evil: true, nomen: true, sloppy: })(Require"use strict".js 2. license SymbolDef(scope, index, orig http://giththist: falseillansole.js 2.1.8 Conteilla = [ory.g ]bal().enterContckageundakagebal().enterContreferencquire[  exec = functioglobal = falsame) {
         mangled_ke/requnullbal().enterContundeclaredg(this, string, name, 0 (stta) {
 his, string, name, 0org.m =.org.m//Set ujs 2.ntext = PeNamtotystrinttp://githun, nullable:D license.op eith http://github.creturnvaluateString&& !ng. Don'    g. Don'.toplevel) || exists = functio|| if (typeof console ==eval)    (nction (st.uses_    ned') {
 on () {
   withRequireJS in,js 2.1.8 , nullsier logging. Don't
        //get righ!me, 0, null);
       iexists log for eang. Don't http://github.cns &var d by         p.js 2.1.8 Copy       }rContext([0] i   receof ne, etext globalpeof nsole ==screw_ie8)proces.parent_g, name) {
    ring, name, 0, null);
      s.next_, null)ng. Don't.js 2.1.8 Copy
     vm = requi}.js 2. or T 'undef.DEFMETHOD("figure_ou //gets"SD license. http://gith !!prelfocess.v.js 2.1.8  !!pr (stringfileN     //gets     };

         !!plabeld bynew Dicenseary executi     nodnestin();
0;

        nodtwre = reTreeWalker( license.node, descend        };
        }empo       //Get the kage process.versions &&empo. in //gets_vars(= defin);
        vm =rNode = faveth.existsS.
   || path.exists/gets replaced. Used in= undefineRequire eRequid;
        define ++= defind;
        define fs.exist    d;
        define eRequire = require;
        nodeDefthis.reqrily hihisContext(this.requeRequire eturn fs.re

        exec = function defined;

d;
        define --     };

        exec = ffancy thruname ? fs.realp require('nd define to allow require.jDirecsts define
        //them.
  e = function (path) {
         push_uniqackage.dtsForNods,      the r. : '');
        };

        exists = function (fileName) {
            return exiWply(process.versions &&for ( !!proceg, nam s;e it
        //gets) srint.applyoces  exists = functi  };

    xists = function (fileName) {
            return exiLRequedStatse;
  process.versions && !!png(t     eRequs.node) {
        env eRequi.has(lfalse,) throw = reError(ntexng_template("nnect {ke/r} is moed twicode l)s.require.makeNodeWrapper.set           sContext(this.requirejsVars.require.makeNodeWrapper.del       Cfined' && Components.cla    exists = function (fileName) {
            return exi fs moe(fileName);
        };


        fileName = processents.interfaces) {
        env = 'xpconnectdefine
        //them.
  thede    (string, name) {
     m.
        require = );
        vm = require('s[1];
        }

        xpcUtil =global fileName = process.     ifef_      //Tempo);
        vm =  else];
        }

        xpcUtil =Defun fileName = process.ne to

        filee if (typeof Csier way to do this.
                var i, part, ary,
               Var con      }

        xpcUtil =C     process.versions && !!p  //Rean easier variundef this.
            requir       return          path.indexOf(':') ===current working direct in ocesw readFi()ileNam.
                var i, part, ary,
               new B  //There has to be an easier path. Use the current workinents.interfaces) {
        env = 'xpconnectRef process.versions && !!prymadFileSyn.getrAt(0)Option = fileName.subst   }
symc = Components.classes;
        Ci UninterfaceRequponents.[{line},{col}]",process.versions && pathame:ths, nif (f             ary.spli') { - 1, 2start.') {                      col= 2;
        colurrent working di}    fileName = args[          //Resym;
        vm = require('von = fileNasSyncwalkse r.js 2.1.8  !!p licstsSync;

        nodeStrin      (c)ile(xpcUti= require;
        nodeDefine  = require.main;

        //Temporarily hide require and define to allow require.j        //There has to be  !!pprev way urn unccurrent working di   returstring, name) {
     irejsVars.require.makeNodeWile: fureadFile:n = fileName.substring(1);
            fileName = args[1];
        }

        xpc        if (part === '.') {
        returnnt slashes
     ubstring(1);
            fileName = args[1];
        }

        xpcUtil =   if (part === '.') {
    
       1, 2);
 d;
        define = und     At(0);

  .findy.length; i.splice(i, 1);
                               ary.splils.Fi     readData = {}        ile(xpc);
      Cc               ary.splim.in();
nputStre     ption = fileName.subst        var              inStream.init(fi= rentext = Pac * senputStresize()e && fse);

                 .initts = function undefined' && Componen        .ceString(t(Ci.nsIConverterInputStream);
 tream;1' 0, fal, ned;
        define                par       },

           .createInstance(Ci.nsIFileIke/req= "    "peof     }

          //Get theequi                inStream.iniargv[3];
    At(0);

    }    imponent      } else if (typeof Component                convertStream.ini                  Ci.nEMENT_CHARACTargue;
  "readString(inStream.availableunc {
   leObj.pat} catch (e) {
                    throw new Err   convertStream = Cc['@mozil,

            xpfile: function         throw new Err
                    readData = {},
                    fileObj = xpc                try {
                 re.js to ire('path');      require =de 0.7+ exisundefinejavascript.Contef (fileNamrhinoContext.evaluatpath. Us(path));
                } catConte license eval(string);
        };

        onents !== 'his, string, name, 0         } chis, string, name, 0 || path.existsSync;

       Conteenclostion noContext.evaluatcke/requ-1g for easier lo= define;
     };

    
            }
        };

  ntext.
e 0.7+ existsSync is onfancy thoughhas_f (fileNa(on context.
      }
           global      };

        readFile = xpcUtil.re

        ex     }
        //De       require =.apply = 'n, leObj.pat) {
            retur finally {
 his, string
                   /ire('path');   returnde 0.7+ existsSync is on fs.  //Reec = f * in eitnt slashes
 rect   return .v[2] = 'n               rocess.versions.node) {
while ('t
        //get v[2];

    ogging. Drarifr.js 2.1.8 Copyright ===rke/rpeof Cobreak * This is a boit
        //gets replaced. require('     ere/requ         pr= define-anspiler p
/*globaply(undefined, argumbquire('path');       }
            };
        }
    }        return rhinoContexent, importScripteserved.
 * Available via the MIT or new BSD licConte     /requirejs for details
 */
//
            }
        };

  mozilla.org/n= xpcUtil.realse, ttp://githEMENT_CHA }

        xpcUtil = {
        det try {
       fancy though  return 1, 0, falsned') {
  || path.exis       jsSuffixRegEx@mozilla.org/network/file-
            }
        };

                           the r.j  log: function () {
 sSuffixRegExp = /\.js$/,
        c              the r.j||v = 'nof (fileNamfileNaOf     aps>= 0 ? /\.j :   };.\//,
        op = Object.prototype,ier way to d            stil = {
              exists =  encoebWork if (fiee: httpy.length; ebWorke== 'undefined' && navigator && window.dop = /(\/\*([\s\S]*?)ebWorker = !isBrowense.
 .js 2.1.8    }
    }"\s]+)["'];
  tScripts !=                   //Remtl/converter-nse Reloading', 'load']
     ebWorke.js 2.1.8 Copys unfortunate, bportScripts !== ms with requirejs.nScreString(t procect.
/*jslint regexp: tr  convertStream = Cc.
 * see: h"\s]+)["']\s*\ execution,
s.
        readyRery.ger detsure how
         require('fancy ttScript     //Relly. Sequ
            }
        };

     fs = requ            g. Don't
        // !!pex     r logging. D.js 2.1.8 out: supportunde                 !!p    base54(++get fancy r.js 2.1.8 Copyrigh!is_identifier(m)) contin         ary = pargv[3];
i =pera.length; --i !!(t; if (part === '.') {
          ext[i  exec = fuso crazy
          sym0, null);
    ||n]';
ss !== 'undefined' &&p = ]';
 try {
               righmARAC\*\/|(= [],
  .toS1) {
                    parfancy tpfile: funcvm');
             }
        };

     return t for complete
|([^:]|^)\/\/(.* inS }

        xpcUtil = { inStr]';
ttp://github.com/jrburfancy thoughgging. D    isBroll br<(type  }; :  xpfile: ation All Rights Rire('path');ss !== 'undereason.
        isOpera = typeofancy thoughttp://github isArray(it) {
        < ary.length; i += 1) {Accessor
                if (ary[i] && func(,
        hasOwn = o  exists ent, importScripts, setTimeou Helper function for iterating over an arra Dojo Foundation All Rights R   * returns a   return reason.
     i, ary)) {
                    breakequirejs fo    fuARAC0    ifunction () {
                    print.apply(undefi    function eachReverse(ary, fu= functi                log: function () {
         break;
= functiseElement, dataMain, src,
        inte     break;
                }
            Dojo Foundation All Rinc
     * returns a hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) eachReverse(ary, ttp://gith                log: function () {
      /c(ary[i], i, ary)) {
               Stream;
                }
            }
        }
    }Streamc(ary[i], i, ary))h = require('path');_defaulfs = reqr_g. Don'[i] && func(ary[i], i, ary)) {
           vars     isO                except: []                  :nction              sort) {
                 = 'undef) {
                  ire befo) {
   }

        //Set up       path = require('path');, null;
   for (prop in obj) {
             (typeof!== 'un     var prop;
        fire('fs');
        mportncy though.
       ch (eos = reqon't
        //ch (e) {
                    throw new Error(path + ' failed: ' + e);
                }
ect';

        Components.utils['impordefin= define;
 funcsContext(this.requirejsVars.require.makeNodeWrke/requiget, prop))     readData = {},
                    fileObj = xpcUtil.xpfile(path);

          to define
        //the    r        }

   , aon't
        //           if"\s]+)["']each       //TebWorker = !isBrows 2.1.8 Copyrigh           if r i;
       ecution,
                    inStream.inia$/,
        defContextN     if (convertStream) {
     lice(i, 1);
           de's requort) a
           //Ta, b                inStreamfancy tbr (i = ary.length -- ar (i = ary.length                  }
on = fileName.substsource, f$/,
 * @licenource, f, aon = fileName.substring(1            return FileUtils.getFile("CurWorkD", []).path;
            },

  
       current working diroegExp =  contextsvalue); support    globalDefQuion,
 /');
            },

  , null);
       nction scripts() {
           inStream.close();
                    = 'unry {
             is' will bforEue, force, dems w'PLAYSTATION 3' ?
aultOnEire('fs');
        e function to mix in properties from soucompute_char_frring)cyget,
     * but only if target does not already have a property of the same name.
     */
    = require.main;

        //Tempode require and define to allow require.j) ===a   C conte     idript    rrint_to_sses;
());   var i, part, ary,
         Rancy e information.
   "fancy " the error ID that maps to an IDT Comweb page.
     * @p= ComString} message human readable erC [],
  web page.
     * @p= [],
  String} message human readable erBins web page.
     * @pgins String} message human readable erDebuggerweb page.
     * @pd + '\nhs) {
        var e = new Error(msgtsForNode(information.
     * @leName.   var i, part, ary,
         Wuppoweb page.
     * @psuppos) {
        var e = new Error(msgottp://requirejs.org/o suppoString} message human readable erI if (part === '.') {
b page.
     * @pifapply(unequire and define toion () {
   web page.
     * @p  vaother AMD loader    var i, part, ary,
         Vahttp://requirejs.orgvarrors.html#' + id);
        e.requ) === -   *
     * @returnss.app   var i, part, ary,
                 b page.
     * @pcument),
irejs instance.
            retuFohttp://requirejs.orgforrors.html#' + id);
        e.requForI web page.
     * @pargviirejs;
        requirejs = undefinSwi     b page.
     * @ps   //(requirejs)) {
            //Do noas
     *
     * @retura
    {
        var e = new Error(msg   varttp://requirejs.org/d  var }

    function newContext(conte     f            e.origitject.
        cfg = require;
      {
   Settnhttp://requirejs.orgset" +    ifkeyId,
            config = {
           G    //Defaults. Do not sgt a default for map
                //config to speeKeyV  loinformation.
     * @ for map
                //config tNe
     * @param {Erroneerr] the original error, if there Tils
    * @param {Error}isString} message human readable errry          shim: {},
ryect.
        cfg = require;
        //assume it is a confcjustrejs;
        requirejs = undefine010-2012 require !== 'unde010-20' && !isFunction(require)) {
          p =   * @ss !== 'undefined' && pinformation.
     * @t.getEl  var i, part, ary,
         ole.l              path.indexof doc= {},
            undef' ? atorrror = err;
        }
        reture information.
     * @pa' ? reRequireJS in the commansed in
    //dot notatiinformamilar            }
  !!p conte functi existsSync is on fs.
ses;
  filbcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_0123456789
      .
       gloher l;
     .js 2.1.8   rhinoCore/o c getGlobal(value          =  {
   .cre  Ciow !== 'und         kupsch(ases;
.split("").map       //T             for (i = fancy tch.thatCodeAt(0);
        vm =     }

    functhat 'a.b.c'.
    funct             for (i =          [ch]e;
        req                 require('information.
  t will keep strut can be remappective = falsstr
    function isFunction(it) {
        retuc to ) {
  ethod MODIFilice(i, 1);
              ifins.
       ) ++.
         ode            mix require('v.. from an array of pt will keep a leading paths that usemergeSilarokups,
 to Function.prototype.bind, but righi    git(a  ret          b))OTE: thigh.
       {
                   b    //End of tha line. Keeugh.
       
    }

    func
        b] -be mapped
 ai -= 1;
        RequireJS in.. from an array ths,  =aths,      if (arys, bu.. from an array glikel{
                    if TE: this ar            Otherwise, there e mag for a path starting with '..'.
           * which ac Otherwise,  rhinoCo contexnu                  !!prlikel"", ..
  = 54s.
        readoized.
         * NOTE: += Sthis ffromCthod MO2] ===[num % ..
 ]    }

    function u    Math.floor     / ..
     }

    function       6      } else if} support    > IES the input arfancy tr            ame = '_',
       contec(ary[i      //achProp(obj, func) {
    requiwarningrget,
     * but only if target does not aProp(obj, prop)) {
              hasProp(o) {
                 func) {
    :ay ba              assign {StStream the name arg is rel..' 010-2012,  the name arg is rel= deed    unapplyMap apply the marop)) y ba
                    return g;
    }

    /**
     * Constructs an error with nsole ==s = functio
      path);

                / name
   normalized(                 inSt './'mali be     } functio      :rt === '..file}:.') {
                        ary.splice(i - 1, 2);
                       , na= 2;
        , na                       i -= 2;
                    }
                }
                return ary.join(1) {
                    part = nsole ==ative
         *if (part === '.') {
            };

        re and define to allow require.jAtive
n normaliypeofath);

                //X inStream =ypeoa require config object
    if (typen normali     = '.') {
                //If have a  in s.node) {
        env  inSg: fion is(name, basunction Stream(  return fs.exi!=h(ary, func) {
   iler pl                inStream           var {msg}g, mapValue, nameParts, i, j, nameSegment,
            nts);sg 0; i//be relative ? "AccglobaalnStream?" : "&& name;
  tonStream"                      splice(i -urn ostre to concat the name with.tarI,
nd.
           baseParts = baseName      i -=  baseParts            }
                    } baseParts      return ary.joi                             throw newconfig.map,
                   name
         */
        function normalize(name, basn normaliT_CHARACTER);
eName, applyMap) {
            var E    is u. Doue, nameParts, i, j, nam2;
                map = config.map,
              func) {
         part, ary,
                 funcainoCo             path.index.path;

         nc) {
    aseName, applyMap) {
            var {//De}ponents.is gName, pkbut not o' for
    ue, nameParts, i, j, nameSegment,
            //De - 1,                  normst t          ivatedme to concat the name w    foundMap, foundI, foundStarMap, starI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
              am {Boolean} atory' and not name of thdule via Nrmaliz) 2010-2012, eName, applyMap) {
            var me = name.o
   ce(i rhinoCo mapValue, nameParts, i, j, nameSegment,
                foundMap, ffor   //modu/modul: "anonymousme to concat the name wtarI,
                baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
              p config to ttory' and not name of th     i > -1;                convertStr[prop]eName, applyMap) {
            var'F         name =gName, pkinap conf s
        ;
     "name = normalizedBaseP'                ary.splice(i - 1, 2);
 2);
                       '));
      }

    TYPE               // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2       * Trims the . and .. fro        on context.
        rhinoCoOutputStreamh.
         * @param {String} name the relative name
         org.  //    : 0                            4              quote_keys) {
                  pace_colon the name arg is relatcii_only) {
                 in') {_scrif (f{
                 width: 8pValue = getOwnmax_     len: 32e3it has one for
e_proof the name arg is relbeautiffind if it has one forsource_mapndow !               racketiz    
                  emi   //applyMap apply the macoman} app    if (mapValue) {rgs,erurn i -=     if (mapValue) {negate_iife: if (typeof console == mapValu)ndefined, a * on if this normal      tion.
;
        reqMaincur    /co } c                        val =ep at least             po use        reqMainOUTPUT
             //uses of to_ conf    , globalDefQ starting with '..'.
  {
  replace(/[\u0080-\uffff]/g '..' || ar             for (i =        if (s method MODIFIE.to      (16                    ary.spllength -<= 2   //E     }

                  strict supporthold on to it 2]';
 if ("0a dein aStream.available(),
  fancy t"\\xhing
                    /m === 'PLAYSTATION 3's a shorter segment match lat4r in a matching
                    //config, then uavor over this star map.
      function trimDots(ary) {
               maketring} i    for (i = 0; aryense.ll f0, s      * This is a botrNodeoundMap) {
   \\b\f\n\r\t\x22\x27\u2028     9\0         breake === pkgName + '/' +ig objrt in browsers, #39Convert    "\\":                //config, then \\";
    foundI = starI;
      b         }

                if (fbndMap) {
                    f         }

                if (ffndMap) {
                    n         }

                if (fnndMap) {
                    r         }

                if (frndMap) {
                                  }

                if (functio           each(scripts(), funct9on (scriptNode) {
                   h mo    foundI = starI;
    '"'        }

           ++dq                 //config, th'"'dMap) {
                   '         }

           ++scontext') === context.contextN"'if (scriptNode.getAttribute('0         }

                if (f0                        throw new Err   if (fS the input array.
         *               onfig, f)                   r.js 2.1.8 Copyrighdq > sqline. Kee"'a de if (!foundMa) {
    "\\'") +      = {},ontextNameArray(pathConfig) &2    '\\"'ig.lame) nt);
                      enin aarI = i;
                    }
ak;
    starI = i;
   .js 2.1.8 Copyrighnsole ==
            line.kely
tndMap) {
 <\x2f      ([>\/\t\n\f\r ])/gi, "<\\/      $1other AMD loader relative module name, like ./           sta {
 )\*\/|([^:]|^)\/\se of pa = /[^.]ck for a               pathConfig.shhConfig = geke/requ         s !== '                          {
        thre;
            }
             (back starting with '..'.
  repea    or a " ",onsole ==             +   foundI = i- efix *        index = undefi       //Pop off the
     !==_need_     
        };

            prefix =         .substring(0, index);
las      };

                 x + = gloh starting with '..'.
  x + t ===At(name]cified
  1gment);
                        ybt, pw valbut can be remappathConfig.sh            lize            >onsole ==            ) param(    dex > -1) {
             l;
 ireS        spli== 1 akePredic  Ci ( [ + * / - , .it will
             provid    for (i = 0; ary       for a hs, id);
         e lookf (part ===DIFIES the input ar[obje               name === '..')) {
          (!ch
   ";}"    isBro    arget  ///[;]$/.tes     }                    if (gget;
    }

          
   rmalize the name via  * @                inStream.ini  }
   += ";});
            }
 = starI;
          ++param {Boolean} applyMap: apply thposap config to the ID.
                      if (!found ID.
         *   fuam {Boolean} applyMap:    * Should only be true if this map  */
        valap config to the ID.
         * Shou             brea                 throw new Error((fileode's reqalue;
       prefix = name.substring(0, inde             throw new Err                name = name.substring(          apping that i1) {
                    part =          prefix =f console ==o the new val retutack[  //I

        /]                    }

 targe           //If no name, then it           turns {Object}
   ter segm            <call, genera                inStream         * @returns {Object}
         * Should only be true if this maparentModuleMap, isNormalized, applyM{
            var url, pluginModule, ull,
                parentName = parentModuleMap ? parestarMap, nameS     * for the m            },

            readadFil }
      ing.call(it) === '[obj   globalDefQ
     readlog: fed, prefix);
          ||Modul * @\"for r/^[\+\-\/n} isNorm     namlativ      se;
                name = '_@r'  (requireCounter += 1);
        e map config to the ID.
     * Should only be true if thisduleMap ? parentModuleMap.name         parentName = parestarMap, nameS !!p     if unctio/\r?\n/     = a

        /y.
         * @            += function () {
 EMENT- 1;  if (name) {
                   += a[n]ince it is easier to                    if (!f               applyMap);
              ze(name, function (na    +) {
         urns {Object}x + 1, strrentName, appl
                      
             se its n             norm?for a path starting with 'provide it will
      sier loggin if (name) {
      prefix = name.suundefined' &&  Otherwise,      foun        //A regular module.
   haln getGlobal(valueathConfig.shprefix = n     foundI = starprovidtion splitPr     ? .5 : 0
    }

    func  //So, do indooopmalized name mmeou splitP        //A regular module.
   col,';
                 //app     =      ]';
t']('  fssplitPrm {String} [parentM= 'st  foundI = i;
  foundI = .js 2.1.8 Copyr foundI = i;
co://gre/modules/          = []gin, resource]
   foundI = i;
                ([id]);
                return truemalize(name,s = splitPrefix(normalizeTE: this;

            rmalized name mng that        //A regular module.
                    normald it will
      so do not need to re     name =      //A regular module.
                    normal;zedName = normalize(name, parentName, applyMap);

       name =           //Normalized na         foeSeg         nModule && !isNormalized ?
                           origi       suffix = prefialized' + (unnorma    prefix =    //If the id is a pl    url = co+1;
            if (in       //Pop off the first ardo thblock(plitPrefix(normalize       eturn {
             {it will
          me,
                ido that par(    prefix =    if (ary) {
                     rue;

                ck(id) {
        efix = nameParts[0];
provide}re([id]);
                return true;
            }
  do th || ps
                url:provide(lName: originalNized = true;

                provide)normalizedName) + suffix
            };
        }

        fsquaren getModule(depMap) {
      [     var id = depMap.id,
                mod = getOwn]re([id]);
                return true;
            }
      a                  normal,lName: originalNse it id that canne, fn) {
            += 1) :
           provide:lName: originalNget;
    }

         //)getOwn(registry, id);

          ddgmenpent if
    }

  meSegmen module.
   token,Array]'ttp://github.ctry=== '..')) {
          (defi)ined') {
          .add{
          name?",ction (name)           s = sle(dep if (mle(deps = s! (typeofle(dep//Defi= " {
 "ypeoe(depe.
 */:Array]
               o spe (exeName, applyMap) {
            var Couldn't 
     .toS  === 'de[i];e, nameParts, i, j, → {c') {
   ror(e[onents                  ary.splitarI,
le(depMap)                       i -= ame === 'er       }
                }or') {
   Module && pluginModule value         if (Module && pluginModule    }apply the m          //Some use of packa  funct""he config.
                        //So, do  so do not need t             malizedName,
            }
          } else {
         //Ion't
        //fancy tttp://github.cget:                   }          if (mod.events.ame :
:                           tion.alize(name, parentName, app
                paren    prefix + '!                      s name.              mod.emit('error', err)            -rmalizedName = nameParts[1 }
            sh    _gins              });

                if (nsole ==s namp = /\.js        }
   (= !!(*
         *         req.onError(err);
   ame,
  :    * de update name to i                            :getOwn                  a:    va                 //baems i   each(ids, f                 });

                if (            req.onError(err);
            :ice in the        * @paraizedCounter +=:t code has a
                  }                        */
          }

                  //Turns a pluonfig values mu }

      lse {
          ot just reassign thex,
                  for (i = 0; ary id) &&
  ray value, since iy(defQueue,
                      prefix fQue  prefix          //this  that par: = {
            handlers = {
 ffix,     'rffix,     handlers = {
 unctio     'runctio     handlers = {
 = regi     'r= regiame arg is relaame === 'd:               each(ids, fg. Donsier logging.     }
        }

        /**
     [opti -= 1;
         context's defQvalue.      id: (prefix ?
           if (!notifie.
            if ( }
             fig,(mod) {
                mod.usingExports = t         isNormal                o//Mamod) {
                mod.usingExports = tpon hasPathFallbac update name to[2];inde
           nstructs an error wame
  o nar det this.
                     return mps = defined[mod.lized.
         * NOTE: thi       op               isrror(err);
             'module': function (mod) {
                                  return      
           e': function (mod) {
           f no name, then 2 -    || 0)i -= 1;
                } else id);

        //T]);
                 DEFPRINT }
  //De, gen                               func) {
    in age and        va       //Pop off the         re('path');     t for complet     ,t code unctio            url: url
        exetOwn(confiundation  pkg =   }

            eam     s = d-inpu    var id = depMapfix ssupportlse,
consconfig.confackages    var id = depMapf: fu
     object
    if ( rhinoCo          g. Donaths                         (!moonly support
    config.confi  //fc= foundStarMap;
     ig.con    functionexports;
                    ub.com/jrbdd_       / + pkg.main) :
       .id]
                      });
                }
                v-input-);
                }
              map = c  convertStream = Cc['@m                 });
                }
    EMENT|| {};
                    rovide!lName: originalN        }
        };

        function cleanRegisid) {
            //Clean up machiner    normalized                id that canng.pkgs, mod                          {String} reason.
        isOpera = typeos && !!proce              for (j w
        //to featng} name([id]);
             ']\s*\r', mod.error);
            } else {
                  reason.
                      url: url: fu     /nfig, modd);

    ot s        existsForNodlizedName process.versions && !!prame ?til.nor
    equire that will
      ame ?                   _dumpeide require and d           tched up
          } catch (e) {
                          /te an
o arrup
    befor                  //conright (c                Exit bee          f             me to arr[depId]) {
  

          vertStream = Cc['@mozilla.oed[i] && !p(ed[i] && || [])    ca allow       mod.defineDep(i, defi                                             } else {
                     mixin(t         throw new Error((filecisNor;
                            mod.checkfineDep(    t
        //TfineDep;
                           id is a plu base nineDepileName.indexOf('-') === inery used for waiting m  if (typeof requir//Deofthat= g = require    });
                processed[id] = true;
            }
        }

        function checkLoaded() {
      -input-     }

turns {Object}
         *//figure out what 'th         throw new Error((= true;
  {Array} ary the a
                //It is pos       fn(mod.evar map1,
                //It is posera.toSe no functi//hing
       +* @reval && (context.startTime + needCycleCame :
                

    if (typeof requir           stillLo2ding = false,
                needCycleCheck = t*ue;

          *///Do not bother if this call wast has not.nl.prototype.bind, but the require = conCycleCheck =   //Do not bother if this call was was a result of a cycle break.
            i map is for a dependency.
         *
(enabledRegistretOwn(registry, ie) {
                    throw new Error((         throw new Error((/figure out what 'th {
                prefior);
                PARENS           expoar c,
                              try[id];
          g.pkgs, mod.map.id);
      r                 id: (prefix ?
        function getOwsDefine) {
       //If the   getOwn                //Only force thin reasonairs pre                //                   //been inited  {
        env = ember it.
                    if (!mod.inited && expired) {
                        if (ole.log('See htt     //Only force things t    Registry }

   ([id]);
             p                  co   }

    p, args, readF     existsForNod         //been inited exists, reqMai= true;
                        } else {
                            noLoads.push(mequis fa   noLoads.push(m[],
        noLoads.push(mof doc = true;
            omplet = true;
            Dot = true;
            icabl = true;
                    comman = true;
            File = funcremoveScript(modId);
            of document !== '= true;
                        } else {
                  righsDefine) {
                                   line. Keeundefined' && Comp      //because it maole.l                           //is waiting on a nonodId);
                                                       //is waiting on a non
             },

            roion ,
       , p    PRECEDENCE[pocall(it) === '[object Fs    rConte(expired s& noLoads.lengts) {
                     p(patp = trpeconspp = /\.j     plf !==    if wai=         ut fo"*"unctis: ' +&&noLoads, nul||")one for a define() module                                       if (!map.isDefine) {
       //If the odId);
             //plugin resource though, keep going,
                            //because it maNew that a plugin resource
           //in the m    }
            } el Trims the . a
    }

    /**
     * Constructs an error ws an error with a pointer to an URL wam.re= Comp not need tturn ary.join('/');
            }           mod.on(name, fn);
          ex     pd is somxists();  err.contextName = context.contextName;
                return onError(err);
            }
equire, define,= true;
                        } else {
                            noLoads.push(m(reqCalls, function (mod) {
removeScript(modId);
            New          //plugin resource though, keep going,
                          no_g reqructorfunction           //Og: f   noLoads.push(modId);
               //loading. be that a plugin resource
                                     if ((isBrowsumber          //plugin resource though, keep going,
                          aluateetVhe r(     f          return (needCycleCheck = false);
                        }
                     if ((isBrowsaN          //plugin resource though, keep going,
                            //because it mas.events = getOwn(undefEvents, map.id) || {};
            this.map = m         ative
 an    le = funcsuppor_rules//plugin resource though, keep going,
                            //because it ma-plugin cycle.
                            return (ne          ifNo reason to keep tive
kLoaded();
                       //because it may be that a plugin resource
                            //is waiting on a nonFile = func that FileSync(pa                   }
                    }
            s.events = getOwn(undefEvents, map.id) || {};
            terr);
            }
protot, = {};
            this.depCount = ) && stillLoading) {
  ile = functi common case, but it is also not unexpected.
          existsForNodSD license.
 * se     //Only force thinRegistry, fuarI = i;
 of the r.rentName, applled or iunter += 1          this.map = m          }

  + '\nh       this.factory = factory;

                if rg/docs/error            //Register for errors on this module.
            display_runn(runninis_= 'undeftory = factory;

       index + 1, runndule.normalize(name, funcan ernoLoads = [],
   stmt, i === '..')) {
          !  errwn(traced, depId)mpty

        
                //It is a result of a cycle break.
          errCheck = expired) {
     (this, function (eit fox + 1&&s
          one for a define() module ID.Registrame,
                ise = getOwn(defined,= 'undefinnot modified. For example
            vertStream) {
         function trimDots(ary) {
           inited &    Bn erfunc) {
     o_param runn                 //Only force thin code hinited &&= 'unrunnin expired) {
                           }


               this.factory = factory;

       llow runn              //Do a copy of/Register for errors on this module.
                h = requ       this.factory = factory;

       are error lisllow runninge na;

                   } else if (thiit will
     this.errback = errback;
                        //Indicate this module has be initiaeRequd
                this.inited = truor errors on thisbe initialized
                this.i this.errback = errback;

imple
                //Indicate this module has be initialized
                this.inited = true;

                this.ignore =ram {String} n_       edsteners     //Only force thinrighan errback td]);
Registr !!suffix,
exports;
                    are error listeners    if,
                //or}ts = {},Registry, func{ normalizedNadirect mod          }

Bfix,              //the dependencies are not known u                llow runnin

                this.errback = errback;
          this       this.factory = factory;

              er for errors on this module.
                 o.on('error', errback);
                } else if (thiso.error) {
              n error state.
     // at t that config            this.inited = truen error state.
     Registry, funcypeof deed) {
                    return;
                           exports: defined[mod.map.id]h, 'utf8');
                //Do a copy of          map =             this.depCount -= 1;
                    terr) .on('error', errback);
                } else if (thi             this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the managch: function () {
                if (this.fetched) {
   y marked as enabled. HoweFred n('error', errback);
                } else if (thi for a     this.fetched = true;

                context.startTime = (new Date()).getTime();

 right (c) in d: is the ID already normalis.callPlu           //Apply  in eith
                //It is poss.callPlu var map = this.map;

      this map is for a dependency.
         *
e {
  he']
 _for_noie.
 * llPlu        the name
        //di             throw new Error((Registry, funcsuffix = prefare not enabled or in error state.
         odules.
            delet              context.load(this.map.id,                  right (c)       th
                //It is               var map = this.map;

                        context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if step        * define it.
        .map           check: function () {
direct modification of thedeps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin(Ie is up, remad();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ?           var url = this.map.url;

     led or in error state.
         Registry, funced' &          //The factory could trigger another req) {
 ond res true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlug       //ask the plugin to load it now.
                ifeoutId     this.fetched = true;

                context.startTime = (new Date()).getTime();

      c) {
    va true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ?  arguments);
                                   //'onkeyworide require and d fs.
        existsForNodence is 'efine()'d  modules. requi  }));
            = requirej{
                prefix = normes: false, uld not be called for fai bind(this, function is module/[^.]var map = this.map;

                      context.startTime = (new Date()).getTime();

      se, requ                  argback = bind(this, funct                     var turns {Object}
       argts = this.depExports,
                         })(this.shim.deps || [], bind(this, function  called more than once.
                if (!this.depMatched[i]) {
  global readFile: true, e this module has be initia         ead of throwing an error. However,)) {                       //only do it for dkihide require and dRegistry, funs = c      }

        Moduletring,
        ha //The factory could trigger another req          r is set, use that.
                            ier for errors on this module.
                 on a               err = e;
                                }
   , param {Str        this.ignore = options.ignor Com                   //favor that over return value and exports. r} [err], mod.error);
           Loopis orhReverse(ary,                        exports = context.execCb(id, factory, depExports, exports);
       eRequ                }

                            if (this.minit is called. So
                            //If setting exports via 'module' is in play,
       r(id,                   //favor that over return value and exports. odules)  return map.prefix ? this.callPlugis one.
                   //favor that over return value and exports. rns {Error}map.isDefine) {
                stathe this.fetch();
               athCoave not comple          ".emit('error', err);
  staffix,
n once.
                if (      return function () {
            return !llow runnline. Kee       lizedCounter += 1.js 2.1.8 Copyright (c) ap s                 f conave not comple             exports = this.exports;
                                }
                            }

              undation od * which ac!name) {
  == '[object Opera]',        }fined') {
        //If a define is alrence is 'bdo not overwri      //If still waiting oports;
                                }
            return function () {
              throw new Error((eTyp err));
          }
            },

                       
                                       }     ehis.map.isDefine ?     },

  gins that may not b              epMaps && depMapn once.
                if (!use of cycles, definedItely enable this fack);
                } else if (thianother AMD loader               context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function right (c)rr));
                         orts already set the de           //The factory could trigger another require call
    n;
    }

    if (tyhe factory could trigger another req                     on () {
    defineDep: function (i,dules.
            delete reg         if (this.fetched) {
       !map.isDefine) {
     k = errback;

   //) : this.load();
                    }));
           ig objectnt < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                        err.requireMse {
                    this.check();
                }
        },

                   errback = bind(this, functaultOnError) {
   ified. For example
             a result of a               urlFetched[u

                //Do a copy of the       exports = coepExports) {
                //Becaerror. However,efinedBranch//would affect that config.
                this.depMaps = d   Module},

            culd not be called for faiified. For example
                                    erremit('error', err);
                    });
                }

                //Do a copy of the depnd(this, function (plugin) {
                       //So, do joins on th                 var.on('error', errback);
                } else if (this.  var                 () {
                        return map.prefix ? this.callPlug   r) : this.load();
                    }));
           
    }
  },

            fetch: function () {
                   //If there is an error lisRegistry, func           enableBuildCallback: true
                        });

             T.log('See https://gack);
                } else if (thistry =ntext.execCb(id, factory, depExports, exports);
                                } cat
            }o spe99). However if a global
                            //onturn nr is set, use that.
                      right (c) 2010-2012malize(name, parentName, true);
                        All Righe sure it is not already the exports        });

               ned && !this.defineEmitted) {
                        tho speed
    req.onResourceLoad(context, this.map, this.depMaps);
                            }
        for det true
                    })(this.shim.deps || [], bind(this, function  called more than once.
                if (!this.depMatched[i]) {
  ode whe) : this.load();
                    }));
                                        'defined', bind(this, function (value) {
                                this.line
 * in eith {
                                exports = context.execCb(id, factory, depExports, exports)obal
                        }
        }
                     detelck = bind(this, function ror) {
                            ) {
var map = this.map;

                //If t          } else {
                        if (ion g object
    if (tykLoadedTimeoutId = 0;                      tavoi
             his.dep                  removeScrience is 'ents.error) {
          er for errors on this module.
                Va() : this.load();
                    })turn value and exports. ion(reModule.exports;
                     s      //the dependencies are not known until is.usingExports) {
   equirmap.isDefine) {
                          if (!urlFeemporait for defi         * define  //errload  * @param        / = {},    }
            } elindex          });
            }

            //If still waiti*/
    function makeError
        = {},
       econded'  is som      arentMap ? this.map.    }

    function defae sure it is not already the          mod.on(name, fn);
  ng
             //O //scripts, then just try alue) {
         the name
        //ding map conf                         letely enable this f', err);
                          on(normalizedMap,
      shell of the r.j). However if a global
                           Registry, func=              //that would result in checking this m          } else {
   /**
            }

    fuoiginMps.push(normalizedMap);

                            if (thi                if (!urlFetchedthe r            loa  //for applying map config again either.
         uire, define, xpcUt', err);
                              //If there is an error lisif (getOwn(traced, depId(reqCaledTimeoutId = setTimeo         });
line. Ke                                 this.map.parentMap);
                                    arg    req.onError !== defaultOnError) {
                                 argp(map.prefix);

                //Mark this as a deg map config again either.
       ser || isWebWo            if (plugin.normalize) {
      hs: {}normalizedMap.id);
                      r(err);
 vim: et:ts  pkg = fined = true;
                        //ceq                       //only do it for]);
             nal maeName = map.name,
              Modulecd - 1, 0].concat(globa) {
                                                   aseName, applyMap) {
 are not modified. For example
             a result of a cycle break.
                        passing                //for applying map config again either.
       exists, reqMain, loa', err);
                                })depCount -= 1;
                    thiuire = context.makeRequire(map.parentMapf operp    // at args, rea              duleName = map.name,
           ng
   p    g to know the
         duleN = function!!(tk = bind(this, function (/[xa-f.]/iisNorm           (            err.contextNamRegistry, func        * @pa

                if (!map.isDef                      getModule(mod                      } ery, normalizedMap.id);
 gn the one (fileName &&      /**
         * Tritive script malib/xpconnect/args.   });

                    //Allow plugins to load other code wiRegistry, funce(depMap);
      ileFunc : null     }

                        try {
       }

      y marked as enabled. Howeole.lPrefix end.
                        if (hasInterao    odule                   if (hasProp(con(op                err/^[a-zstance forp)this, funcized name to load instead of continuing.
                                        return onostror(makeError('fromtexteval',
            stead of continuing.
                    if (this.map.un                                      cjsModule.exf document !== 'undefiencies are not known until icrip
                this.inited = true     return;
                }
  ive) {
                          fetch: function () {
       ned'))       }
                                          e = function (path) {
       [id]));
                         var map = this.map;

                   return;
                }
   ?                //normalized name to load instead      retur

                        //Bind the value of that module to t                     unction () {
    ;

                        //Support anonymous micable in browser env'ry = factory;

               mod = regisexports;
                            n  } else if (t   *nModule.no//gre/modules/FileUtilsen                                      axt, textAlt) {
                       /*jslint evil: true */
                        var modulp(map.prefix);

                //Mark this as ath.
                    plugin.load(map.name,uleMap = makeModuleMap(moduleName),
  {
        env = 'rhinoMaps.push(pluginMap);

   (fileName && fi            callPlugin: function () {
                var map = t.enabled = noLoads = [],
    1;
   id = map.id,
                        //source inputs are not mod
                mod = g inputs are not modified. For example
            rl] = true;
                 lt of a cycle break.
          1;
;
                this.pluginMaps[pluginMap.id] = plnd(this, function (plugin) {
  dependency for this plugin, so it
                        enabledRelt.
   end.
                        if (hasInterakeoundationke.map.isDefine ?                   oin('/'));     exports = this.ex         if (errbackring+ een previousl (typeof requirfig.waitring'd.er     noLoa!                mapValu"() {
+     //a     for     arseFloat    ime the system by creatingRegistry, fun      um       }

    if (typeof requir    globalDefQu.map.ill never be resolved othe                he case of a
                    //cycle         if (ig.co                   ad);
                    });

                ap.isDefine) {
               () {
                enabledRe     / && !this.defineEmitted) {
                        thie.apply(un    breakCycle(dep,value and exports.e name
         () {
                enabledRed up n) : this.load();
                    }));
               andler(this);
                            return;
                        }

       ivated end.
                        if (hasIntera       level
 * dist. return;
                }
         //?e) {
      
    funct) {
/') ===es: false,) {
                            returinterfa) : this.load();
                    }));
           nts. 0                         }
          Ho     do            var id, mod, In     ) { return value; }, null, {
                         1/         }

                    id = d     this.shim            if (plugin.normalize) {
      0ke 'require', 'exports', 'module'
                                if (plugin.normalize) {
                                   }
               a      this.depMatched[i] = true;
                         / = functio            this.errback = errback;

 es;
       this.factory = factory;

                if (errback) {
                  }
                }));

             }
                   if (plugin.normalize) {
     ap : this/a dependency
  rts via 'module' is in play,
         gEfig)nd.
                        if (hasIntera       a dependency
 e to [plugin, resource]
      ave not complehConfig =                  onfig.paths, id);
                       ram {String} [parentMeep going,
                            //because it ma          /^in isNormif (expire      typeof make          try {
   izedName = norall this.check()
                    tal]) {
   efined value.
                                    exports = this.ex      ta   // func
                        this.orts) {
             = {},
   n (name, evt) {
     callback for );

a               lepExports) {
     this.check();
                }
                       });
                }

              });              parentName = this.map.parentMap ? this.map.parentMap.name   convertStream = Cc['@memit: function (name, evt) {
                each(this.e                   = {},triggered, remove
              odules = [id];

    s = this.eif (!mod.inited && expire      if (hasIntera           p        falsodule.no/'one/ else--i],     f (!ha            isDupportiId]);
                        //because it ma
              rap sct Arnstrue = context.contextName;
    oduleMap(args[0], nulleqnot do orNo], argskLoadedTimeoutId = 0;
                        func,   };

        Module.',
                              //Favor detachEvent b= true;
            Sub/addEventListener comment elsewhere
                //Do not do more inits iffunc, name, ieName) {
             ame];
     func, name, ieName) {
               /addEventListener commented callbacks
                 iething
            //otrop(defined, args[0])) {     },

            /**
        it has not
           

                if (!map.isDefifix,
                           //context or how to '                  if (ftion (texength - 1; i > -pMap = makeModuleMap(depM       //Pop off the first arbest_of         if (hasInterat liop(de0]/referent lie the parentName's pa[i]; i += 1) 1; i <nce the pa ++ck = bind(this, function a[iplyMap); <refeexports = exports;

         * @p.call(it) === '[obje defQ{Event} evt
         * @returnuleMap);

                      somethine {
         e;
            }
        um                     bre      numeck for a s0        ray(pathConfig^0\./,     ndMap) {
"e+", "e") ],erating over }

                  )ode, f                          e**
  the system by creating           "0favor        var no6lugiLower   r    tching        var n8er than a plugin resou convertStream = Cc['@mozilreadysta-techan(-    );
            removeListener(-chingnode,
          riptError, 'error');

ng.call(it) === '[object /^(.*?)(0+)$/.exec     ed callbacks
                  m[1]  //ea dem[2plyMap);Exports,
                    expor = {},
         0?\.tion(.*n intakeDefines() {
            vrgs;

   2      -.getA    e, get t//Any defined     /.substlasse    isBro       //already be normalized but this one wstenerment);
                        sta;
     errbad] = this;
                r) {
                     cb(evt);
] = {});
                           //Do a copy of theturn function () {
            ret           if (name === 'error') {
            o.
                this.enabling anonymous define() module: ' + args[      each(this.depMaps, bind(thi      //Pop off the first arre('AP                   var c,
                              
        };

    // For packagesmatch', 'Mismatched id) {
              if (mod.error) {
       //Because of cycle    the moduleid;
           /uses of ..
ic      }map_xt, to reinforce
ontext.execCb(id, factmodule.
         wo/three.js', bu    defined: defined,           tched,
                       varuleMap,
    this.o nextTick: req.nextTick,
            onErefineDep nextTick: req.nextTick,
            onErJumprror,

            /**
             * Set a                 guration for the context.
             * @pver,
             id;
               {
       obal ror,

            /**
             * Set a fined &                if (cfg.baseUrl) {
             trace        if (cfg.baseUrl.charAt(cfg.baseUrl. callback for a  nextTick: req.nextTick,
            onErre;

     sure the baseUrl ends in aser |                }
                }

     .log nextTick: req.nextTick,
            onEr        nextTick: req.nextTick,
            onErtion () { nextTick: req.nextTick,
            onErro* in either              //they are additive.
       led) {
   nextTick: req.nextTick,
            onEr        commandOption = fileName: defQueue,
            Module: Module,
                nds: 7}

        //Set up execution context.
        rhinoCoComrgs, or, prop)) {    i_by     var|([^:]|^)\/\/(.*-1; i ame, evt) {
  if (propkLoaded();ete'  if (prop === 'map') {
                       e.maT* @licener.callcheck is unf) {
   is unfaf  //bal().enterConte{String} name the relative name
         tring)ces: !) {
             update name to gs[0];

                     mixin(configdea     defe, true);
                      rop_/docs/er                } else {
        unsa    ring} baseName a real        p//Match, update name t       thisalue, true);
                     
   aris                        mixin(config    uat                 } else {
        boolea  eachProp(cfg.shim, function (valuloo     config[prop] = value;
          o
  isArray(value)) {
               hoist way(isArray(value)) {
                     re =ind if it has one for
f_singExisArray(value)) {
               join             if (cfg.shim) {
          asca                  } else {
        n.
 _effec app                           value }

    /**
            //thisbe mapp the name arg is relStream    s: {ng map confreturn;
             if (prop      //Definquire.ma   }
               && ((           config.sh            ntext.makeRequire             //get fancy though        keyed, args[0] {
            d.exports;
                env = 'nod
       be mapp)getOwn(config.* @licethe modulequireJS 2.1.8 Copyri {
        ) {
  efined[mod.map.rarily his.ort to de require and define to.    eez                             efine to allow require.js to define
        //them.
             tails
 */
//Not {
             index      gName,tion.eout(f                     //their irejsVaremporand config.pkgs is t        //be    m]
  nd config.pkgs is t                  target[prop] = {};
                = 'stvar locaait time e      var locan (plugin) {
          pkgObj.name,
          return {
      , since currentPackages can
                       location: locatio                                 //their cation = pkgOb} catch (e) {
       location;

           an array. If         config: function () {
 OP             pacvar c,
              //would affeconventi            
          name] = {
                                           //since       pacbj.locatio                          oprt.
    entioed = waitI //some             //that ptain || 'mai} catch (e) {
           athConf                /**
        throw err;
    }

     * @licensExp, '')
                ry,
            definediffthe module should bDirRegExp, '')
  iven an event from a scrip             cjsModule = t                malival    to= xpcUtil.rea       if (ieName) sOwn = op.hasaram {String} idct Ar * @param {String} id                          //exports 'errod = ozilla,g[pro         };
        }
    //m    /fine Otherwise,xp, '')
 lla.javascript.e changed.
                          ctory.ge        //and only if it ha        hideoo
      ctory.geen' && opera. be supported, but this oete'd = /so ttypeof pkgObjir info, like URLs to load,_ary.Timeouan  var //some, v    nction (mod, id) {
 righ maps       }

     rgs[2]);
   val                    //Done with modi        ig.wait   loremoveListener(n
      traced        }

       for iterto load,
                                          lue:    rentMap ? this.map.r all packExp, '')
               });

                //If a deps array or a config cisNaNormaust         :
           specified, then call
                //require with those args. This is useful when require is definedize the                //config object befo    js is Tr               della.args. This is useful when require is defined/be terfa     //If a deps array or a config callb', bind(thition (value) {
                function fn(        (jsSuffixRegExp, '')
   }      m.readString(inStream.avairay or a config callbN
   it) {
                       e module is ready to define itself, anrmalized) {
     if (        }
                    return ret || (  if (moexports && getGlobal(value.exports));
                }
      = Components.classes;
        Ci Ca    handleshim.
    ofegment it('/')rts.concat(name.split('/'));
       }
     return ary.join('/');
          func, false);
            }
ass && depMa_acablkagee;

        ex           nt i         singExp             mix     callbreturn onError(makeError('mismafancy thoung               if (                }

                  eachireJsBuild = true;
                    }

      unction(callback)) of dep   exec = fu             functioeps, caconvert       tos = name.spack))    * and then removes the evenis_e     {
                        callback.__requireJsBu                  //is                   if (isFunction(callback))le are requested, get the
                               if (typeof deps ===e, get the ry trailing .js, sincehis, string, na    //since they ar if or lis mod.on(name, fn)righxrequire)) {
        //assingExppts, then just ) {
                 dMap);
egistry[relMap.id]);I                      DWhis.lized.
         * NOTE: thixuireMap = this.map;
  callback for  ? module.:urn handlers[depsupported, but this opts, then j    //since they art !==enmodule inited &s
                    config. !!pCHANGED     } else if (i > 0) {
          eturn rtion || pkgObj.name,
      (req.get)ostrlimin    spuriousif (ar });req.get)                    ary.s         fig, mod   }
         exports = this.ex     }

                      }
    f (req.get) {
          .exports));
                }
           ..
                        map = makeModuleMap(deps, relMap, falsellback_                       id = map.id;

                        if (!hasProp(defined, id)) {
  {
       map = makeModuleMap(deps, relMap, false{
       ]
               id = map.id;

                        if (!hasProp(defined, id)) {
  lue.expormap = makeModuleMap(deps, relMap, falselue.e (strcusts ire =              id = map.id;

                        if (
        eturn r var depId = depMap.id,module na     * @returnsfirst arr              //Normalize module namuse a file name.
        en    (string) {
                        //Grab.reducno path thaa    augin() : this.load();
        cb) {
                    cb(evt);
      //If still waiting oRequire);
(Ci.nsIConverterInputStream);
      * @licea,e global queue.
                               //with the dep function (cb) {
                         each    //Some defines could have been added since the
           s();

                        rstsForNode(fileName);
        code without        r i;
         the r.jarget[prop] = value;
                                 modId = map.id;

             //cskipMap =, modId, err, usingPathFallback,
          //Skip things that are not ave been added since the
                      };
         map is for a dependency.
         *
d.skipMap = options.skipMap;

                         csingExpa.exports));
       ,alsee && !this.ignore) {
         rhinoCoor('notloaded', 'Module name "' +
      use a file name.
              ..
                                   
   ule vi                       slash                             //Mark all the depe if      ; i += 1) {
as needin    function isFunction(it) {
        egistry,
  p);
  req.get)target for Firefox 2.0's          ' : 'require';
          });

     an URL pa     /name, evt) {
     on a  been maeMod.invar   coength - 1;         }

           abled: true
                        });

   ;
    }

 if                  scri});

    ext,
               IfastIndexOf('.'),
         tTick(fuuireMap = this.map;
  on a we                     requireModule.         var leNamePlusExt.lis is t

        //Get the              //dndencies      indworksex = modu   indrr));
                            }

    enabled: true
                        });

   mod.depMatched     a config callbaions.enabled ||   ind       th     //If the baseName is a s to the deps.
 :               moduleNamePlusExt = moduleNamePlu waitInterval) < new Date;
            .unshif  vaExports, exports)egment = moduleNamePlusExt.split('/                     }

     ve a file extension alias, and it   //dots from a relative path.
     if (index !==             !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(ind         */.clo. For example
                ler was trigg    exists = f   //d (mod) {
                map = mod   //do                          //Done with modiusExt,
                                                relMap && relMap.id, true), ext,  true);
                        //dots from a relative pa  retu.';

   index !== -1 && (!isRelativso than URL p/Have a file extension alias, anmakeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                elsuire: function (      ];
    moduleNamePlusExt = moduleNamePlusExt                   if (value.iniap = ;
                        }

                        return context.namep, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

        if (index !==                   localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                     FileSync(path             ..map.i                        return hasProp(defined calls
  leNamePlusExt.len callback for a GlobalQueue();

                        var .substunction(callback)) 1 && (!isRelative?
      ree),
                            mod = getOwn(registry, id);

          on (id) {
         just any relative pathrefix ?
              .cur, true).id;
                    return ousExt,
                                                relMap && relMap.id, true), ext,  true);
    amePlusExt.1(mod) {
     ned: funct   //otherwise, aions.enabled |) {
     if (!relMap) {tion (nid) {
           * is passed in for contextone for a define() module ID.                   ext = moduleNamePlusExt.substring(indg, ps;

                   take      alQueue();

                        var map = makeModuleMap(id, relMap,       ),
                            mod =true).id;
            n (mod) {
                map = mod                     }

                            cl                  return context.nameToUrl(norap = options.skipMap;

                                                   relMap && relMap.id, true), ext,  & relMap.id, true), ext,  //SkieTypabor  });                              relMindexc  * @                 his.module; ?Converts a m if uginrol_all, g(abxports !ndow !                      relM(evt)//in onfits from a relative path.
 ab   if (mod) {
     overim, moduleName) ||is one.
        back. && hasProlct //isim, moduleName) ||r(id,      co If require.get is
                takeGlobcwn here to keep code compact.
    n(confxports !== undefined &&
   * Internal methodmove] === nul mainScript, subPa,  === null                      relMap && relMap.id, true), ext,  true           ext = moduleNamePlusExt.substring     define               }

           .slice(0, -indexOf(id + '_unnord);
                    },

                    specified: fu  //using a di        }ing a different config.
                            if (mvents.defined) {
                                undefEvents[id] = mod.events;
   .substret                     relMap &&                        found = true    exists = f               } else if (args[0] === moduleName) {
                        er aound matching define call for this script!
                          },

            /**
             * Called to enable a modu                                   relMuleName the name of the module to potentially co not overwrte.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some                        if (found) {
                 er anond) {
                             ice(0);= moduleName) {
                         module
                               cleanRegistry(id);
             this script!
                        found = true;
                    }

          fications belote
                        //the call for it.
                                 //waiting  }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, modululd be a script load or just a load pass frgins th                     reit.apply(global, argumentready been normalized. This is an
             * internal rectly, and
                //doing a direct modific              return trure, {
                    i, true);
                        id = map.i           });

           qu            node.removeEvent     xt();
                * /**
                     * Converts a module name + .extension  loaded yet fo as needing to be loaded.
                    context.nextTice URL, i/Have a file extension aliasextracsed in again, nt.
  Partachr ea               if ];
   bj, fn) {
        re map is for a dependency.
         *
tTick(function () {
    his.module;/Have a file extension alias, an      comp{
                var found, ally c //If already found an anonymous modtTick(function () {
     efQueue.length) {
                    args = balQueue();

          overridehim.exports;

              ss
                             localRequire.undef = functi== '..';
= null) {
                        args[0]s[0] = moduext || '')                    t return it.
                    //Add ex  mod = getOwn(registry, modul              //Skip things that are not enabd.skipMap = options.skipMap;

                 * @param {String} modu         //Skip things that are not d.skipMap = options.skipMap;

        & relMap.id, true), ext,  n(confentially ))he URL, it iatch (e) {
                    throw new Error((       }

                mixin(localRequire,                               * !tory.g       throw err;
    }

    //Grab defines waiti{
                    ior context: ' +
                    return map.prefix ? this parentModule = sater ;
                        pkg =equire
   ll f[]dule(dule name. It does not rn;
          seq: defined[mod.map.id]
     ll f  //fromt.
    }

  eqund && !hasProp(definedright hConfi             var modgth);
            xist      //If still waiting o.substreq        return;
          pluginMap = makeModul       .exports));
                }
      rentModule)                  e               context.nextTick(function () {
    mizer. Not shown       requireMomplet      there are dule(   require     this.pluginMaps[pluginMap.id] = plthere are  module: ' + args[argt for context: _2   cegExp, '')
                    Require);
g, parent, !it is just
                //an URL t pkg, pkgPath, syms, i, parentModule, url,
     the main modul (req.get) {
                         ) {
           nse aref !==        }
                      if (mod.module)ust a plain ppeof iread               if (thisth.
       === '.') {
                 //If still waiting o     Modukg.locly be true if this map is for a dependency.
         *
         //fromgPat     ,               }

                                for (i =Scripts !== 'unExp, '')
                                url = of a module          just any relative path.splice(0, i, parentPath);
                            break     if (name) {
           d extension if it is includeed;
                    //Just a plain        eachProp(registry                breakCycle(mod, {}, {});
 pdate name to ts.spliion () { return value; }, null, {
                                            enabled: true
                        });
                      a path.
                    paths =    /**
             * Internal meth== '..';
    } timeoon (id, u
            },

          ;
                } else {
             
         rue;
th = p
        ent.
             * A load event co            es a modul url);
            },

            /**
                     a path.
                    paths                 }
                       paths = config.paths;
                rce, or there are still outstandis.inited = true;
                       this.error = err'/');
                    //For each module ntTick(function () {
       return onError((this.er                        b * Executes a so,
      t(deps, callback, errback, {
    tTick(function () {
         fileName = process.        /**
      args, readFi * Executes a  args, rea             *
             * @param {Event} evt the event)) {
    ireMod.ini  return config.urlArgs ? url +  index = m was loaded.
   od.init(deps, callback, errback, {
    ion (evt) {
                tTarget instead of target for Firefox 2.0's sake. Not
akeModuleMap(id, relMap, true)             *
             * @param {Event} evt the event    //asthe browser for the script
             * that was loaded.
             */
            onScriptLoad:uleName, ext, skipExt) {
              ) {
         ap = options.skipMap;

    js'));
;
                        } else if ?   int                    shim this script!
       pkg, pkgPath, syms, i, parentModule, url,
    ')));
                        }
             entName, applyMap);
          just any relative pathndencies as needing to be loaded.
                    context.nextTick(function () {
     = {
      /addEs'))rror: f.slic makeheckslic(evt.currentTarget || evt.sr     is modified byta(evt);
       ?
       heckis modified             *
            relMap));

                        //Store if map config should be dMaprror: fu   */
            onScriptErroe function
overriden     evt) {
 ion (evt)d, url);
            },

    ave been added since the
                  in the right sequence.
       unction (id, (evt.currentTarget || evt.srcElement)     t);
                if (!hasPathFallback(dathe module that
             *
             * @parument to require is a string, then the                      //registered for it. Start with most sd.skipMap = options.skipMap;

                 inis.map.url;

                //Regular dependency.
     unction callback can
     * be s     });

                    return localRequire;
                }

                mixin(localRequire, {
        op off the first arrodule id.
                //The slash is important for protoall, g.completeLoad(da ..
         var Dro== 'de //The slas in a ue, nameParts, i, j, namck(dawo/three.js', but weck(da          });
            }

            //If still wunction newContext(contextN           load: function () {
 uirejs = function  in again,   naallback, errback!                      //'one/two/three.js', but we           if ( mod_ in ealntioont slashes
     
        ll, g      }
                }ntextName = context.contextName;
                rentextName = defContextName;

    firstChar = path.cha      if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = cal[prop] = {};
            tName = context.contextName;
                retry, pluginMapuleName, 
    function getGlobal(value !!pu
   _ize      "!    delete"        return o     f docntexts, coni and"ized) {
  ext ==ext !extNa=textNameextNa<ontexextNa>textNa        if (!contdef the module should be executed, and {
                node.removeE this script!
   if (conurn onError(makeError(lized.
         * NOTE: thime            expired wn(contextis.map;

                //If t if (con = true;
        back);
    };

    /**
     * Support require.con {
        psp = ap.sp   });
      l, noLoig) {
        retu    p = /\.js     isntextears o = /\.jsned'))ute somethin       }

        return context.requiodules.
              lized.
         * NOTE: thi           returute something after ton () {
    rent tick
     * of the event loop. Override for o normal,  * that have a better solution than setT   });
      =

    er the current tick
     * of the event loop. Override for oexists, reqMaihave a better solution than setTidron to execute later.
     */
    req.nextTick = typeShitTimeout !== 'undefined' ? function (fn  exists = functio/ : /^(complete|lo           d = req;
    }

    req.version = version;

    //Used to filter ou})       //Temporash(mod);
               s, setTimeoutte someth.error) {
             * of th
    function getGlobal(value) { (config) {
            context.configure(config);
        }

        return context.requi           //Enab   }

    req.version = version;

    //Used to filter out dependencire(deps, callback, errback);
    };

    /**
    n) {
        setTiig.waieturns {Object}o cooperate with other
     * AMD loaders   context.completeLoad(data.ition (fn) {
        setTi+

   ule.expExecutex,
       context.ceq(confihe curreng gets used.
     e later.
     */
    req.nextTick = typeof setTimeout !=builds, the latest instance of the defig) {
        retu= req(config);
    };

 += /**
     *op] = function () {
       n (fn) { fn(); };

    /**
     * Export require as builds, the latest instance of the defaultt alrea.head = document.getElementsByTagName('head')[0];
      odules.
              g is in play, using appendChild is a problemeout.
     *g gets used.
      Function} fn function tIE6.
        //When that browser dies, this can be remove);
           builds, the latest instance of the de ..
                  }); /**
     * args, read      */
        function nors that require/module. F      eout(fn, 4ed to this
/be relative= /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contex traced[id] =hem, since their info, like URLst listenest1is.it2         config.pkgs = the ry,
              se {
     de fsed in browser envs.
     ?/
    for tlize(name, .context;
        }

        context =                //If t, id) {                //some use a file name.
        ..
               ument.crekLoaded();     s       * Called to ebreakCycle(mod, {}, {});
  !!p   } careadyumen        * e transient.
                    if (!modnd config.pkgs is ttance of the de[ Creates the       f (!m       * Called to e       */
            execCb: functng
        ion g //scripts, then just try back later.nt.createElement('script')          exports = this.expor require.
           this.de                    b        function localRequire(deps,    ument.cr as = name.spue, nameParts, i, j, nam      o/thrgetElementsByTagName('head')[0];
      and time is up, reme latest instance of the dent.createElement('scrito filter out deng in the v.map.id] = {});
         location;

|| 'textnfig.pkgs is the internal tranfault context.
    req({});

    //Exporto findlly. Sequencewser dies, this can be removed.d) {
           e latest instance of the default = functio       }

        return context.require(deps, callback, errback);
    };

    /f opeait time                         function (mo) {
        (evt.currentTarget || 
     !         }

                if!ev(ounde IE9 has
            //aof earl        }

           ng
                    getOwnif (typeofg.waitexports;
                              tener a   //that do not match the behavior o;
      de = req.createNode(contance of the defg.waite and script onload firings
nts.         }

                if     tener and script onload firings
~         }

                if~tener and script onload firings
-      //that do not matt, which fire the onload event for a
ack.0ipt right after the script execution. Se-        //https://connect.mi+         }

                if+hich fire the onload evns || {};

             eq.createNode(config, moduleName, url);

    * AMD loaders on globally agreed                * Exeif based https:f !==                urlttachEvent first because IE9 has
            //a&&         }

                ifev      = doev         e IE9 has
            //a||de] then it must NOT natively supported||                    //in IE8, node.attchEvent does not have toString()
                           //in IE8, node.atode] then it must NOT natively supported.                    //in IE8, node.at^de] then it must NOT natively supported^                    //in IE8, node.at                  //Check if nosupported+                    //in IE8, node.at*    !isOpera) {
                //Proba*                    //in IE8, node.at/    !isOpera) {
                //Proba/                    //in IE8, node.at%    !isOpera) {
                //Proba%                    //in IE8, node.atOpera implements attachE         //Proba-                    //in IE8, node.at<<    !isOpera) {
                //Proba<<                    //in IE8, node.at>>    !isOpera) {
                //Proba>>statechange', context.onScriptLoad);
                 //It would be great to add  an error handler here to catch
      ==    !isOpera) {
                //Proba= whicange will fire before
                 //the error handler, so that does not  help. If addEventListener
           !    //the error handler, so that does no!re load, but we cannot
                ///use that pathway given the connect.micro help. If addEventListener
           
                node.attachEvent('onreadte,
                //then fire the sc    //the error handler, so that does no< help. If addEventListener
                          //It would be great to addpe: IE10 fixes the issues,
               //the error handler, so that does no> help. If addEventListener
           i    return name;
        }

   supportediontex       } else {
                nodcontexts[.addEventListener('load', context.onScri    //GettLoad, falshEvent is artificially added by custom script or
                    //natively sther envs
     * that have a better solution thanevf passio,
       ?e appendChilout.
  ,
   appendC    if (!found && !hasPropethods on global require.       /ed by browser
                    / .repe: http://github.com/jrbur           if= dod      retuthe Dly arg/of the ap.
      //Remove leading doom script or
                    q.isBrowser = isBrowser;
    s = req.s = {
        con| 'tetexts,
        newContext: newContext
    };

    //Create ed: urlFetched,.map.
      back);
    };

    /**
                if (n onError(mnfig)          //it.
       quire.c:ontex               var modules, rea:    rentMap ? this.map.parentMap.name : null,
      if (config) {
            context.configure(confi           currnd config.pkgs is thit.
     *
     * @param {Object} context the require context to find state.
  ing} mod.map.ithe name of                  e module.
     */
    req.load = function (context, moduleName, url) rtScripts will block until
                //its script isre(deps, callback, errback);
    };

    /            });
      !"if (typeof d //Set up load listener. Test s, importScripts will block until
                //its script is  //If BASE tag is in play, using appendChil                },

                    s,
        jsSuffixReferent config.
                     )
                        dies, this can be removed. Details in this jQuery bug:
        //http://dev            context.onError(makeError('importsc(string) {
            returferent config.
                     
        exists = function () {
                              'importScripts fat listenrtScripts will block      ake it easier to cooperate with other
     * AMD loaders            } catch (e) {
                context.onE    ait time expirede, if it contains . or ..
                  });

    map = makeModuleMap(deps, r        //Synchronous access ript' that other browsers do.
       is module                                    relM)
                                re the script load event listeneLook for a data-main s=cript attribute, which could also adjust the baseUrl.
    if (isBrowshEvent('onerror', contextLook for a data-main < the script tag with require.js in it.
        eachReverse(scripts(), unction (script) {
            //Set the 'heam the script tag with require.js in it.
 leName, ext, skipExt) {
                var paths, pkgs,      }
        });
        retu           //the error handler, for a data-main !m the script tag with red also adjust the baseUrl.
    i       //use that pathway given for a data-main =in becomes the
            //baseUrl, if it is not already set     //is used, then IE wihe path to data maiin becomes the
            //baseUrl, if it is not already set.

            dataMain = script.getAttributein becomes the
            //baseUrl, if it is not already setcode] then it must NOT na for a data-main ||cript attribute, which    (typeof importScripferent config.
                         f self !== 'undefined'))ferent config.
                         pt.readyState === 'interactive') {
                 //in IE8, node.attachEvent does not have t for a data-main &&f data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ?
            }
        }

        functiortScripts will block until
                //iq.isBrowser = isBrowser;
    s = req.s = {
        con.map.i                //some use a file name.
  fined.
                         //Done with modifications, asontext: newContext
    };

    //Create default context.
    req({});

    //Exports some sion;

    //Used to filter out dependenci                  this.dedataMain;
                }
);
        }

        return context.requi            node.setAttribute('data-requireconn that handles definitions of modules. Diffnt in circular uire() in that a string for the module should be the first argument,
  callat are already paths.
    req.jt using
                  on( plain URLs like nameToUrl.
        
             {
     e.exportsFn aseN    // Adjust args if there are dependencies
  s some context-sensitive methods on global require.ions.enabled || this.enabe latest instance of the default     eps, callback) {
  for ' +
                             lbackat are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    re    */
    req.load = function (context, moduleName, url) pendencies are loaded should
     * return a   * AMD loaders on globally agreed names.
    * Execeps, callback) {
    req[prop] = ack = deps;
            deps = name;
            name = eof setTimeout !== 'undefined' ? function (fnion;

    //Used to filter out dependencither envs
     * that have a better solution than setTimeg a dif it a
        //CommonJS thticket/2709 it a
        //CommonJS thon () {
    ack = deps;
            deps = name;
            name = ole.log('See htte latest instance of the default context
    ame);
   });

    if (isBrowse+
                    .r--
         ed to this
ack = deps;
            deps = name;
            name =  stored on the node), hold on
                      deps = null;
        }

        //If n {
        env =  fileName = process.argv[3];
 the firs.enabled = true;
nction isFunct   Module[prop], vae, deps, callback) {
        var node, context;

    monJS thing even without require calls, but still
        commandOption = fe latest instance of the defaultap.isDth dependencies.
        if (!deps && isFunction(callbackcable in browse/could use exports, and module. Avoid alse;
  rts and module
               alse;
  ough if it just needs require.
                //REQUIRES the function to expect the CommonJS variables
            //Not ex deps = [];
            //Remove comments from the callback string,
 rt require as a global, but only if it does notarendencies,
            //but dtAttribute('data-reql back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
     eps, callback) {rror = defaultOnError;

    /**
     * fic nam{
                    (typeof dep= documng.fic namme = config.context;
        }

        context =  * @param {Object} context the require context tnormaliz                 that a build has been doaram {and callback is a function, then figure   var config = (context && context.confffix,_.
      XPCOM, you so crazy
    the first argument'sracing dependencies, and     tionating the n (namef('!1n(localRequire, {
             return a val= '/';
     s. If no conode) {
                ength - 1) !== deps, callback]);
    };

    def      if (reqe latest instance of the default (!relMap) {
  d callback.
     = dod callback.
ne
            //call to the module naq.isBrowser = isBrowser;
    s = req.s = {
        confic narror = defaultOnError;

    /*ages bac                this.facto   context.completeLoad(daid = this.ray.prototype,
    l of the r.j     n (text) lyAddingScript = null;

            retur                          return int      config.pkgs = pkgs;
                }

 text the    this.on('error', errb
     */
    req.exec = functi ..
                                 docume    //Set up with config info.
    req(cfg);
}(th)
                   
        require: rever,
                //the depend
     */
    req.exec = function (tdule. If require.get efQueue.not module name lookup, so just    },

  orts !        
     *turn eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));



    this.require  //Mak (i = ary.length - 1; i?bootstrap s{
    jsVars = {
        require: rea value to define MIT or new BSD license.
 * seeootstrap scr           if low runninExp, '')
                ) 2012, The Dojo Foundation All Rights Re callback for a given
         , url) {
        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
              },

                     });

    1    //If a deps array or upport an                });

    lastIndexOf('.'),
 ) {
        /**
 * @license RequireJS rhino Copyright (cis));



    this.requirejsVars = {
        req&& navigator && windowrrentPacka                //some use a file name                          mai{
                return ved.
      (getOwn(traced, depIdh = requ       */
/{
       text, use the global quein_n coule name. It does not 
(func              return vm.runInThisContext(this.reque = fs.exist               main: (ch (e) {
                    throw new Error(path + ' failed:   contextName = due */
              reqCalls = [],
               deps = callback;
                callba          equire.load =     indexOf('./')                                  tName = context.contextName;
    gistered for it. Start with most specie = defContextName;

        //s = d.existorked.
                    url = modulence cunormalizedMod) {
                                  url = moduleName + () {
urrentTarget instead of target for Fi
        require.nodeRequireerrback) perf issu            //all old browsers wial require: false, definedeps, callback) {
    moduleNamePlusExt = moduleNamePlusExt so it
  This ry {
             .
                    paths = config.paths;
              ths = config.paths;
               after the cycle of callGetModule ie Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via stored os limited RequireJS
 * usage frov[2];

   nction/'one/tttp://githubirejsVars.nodeRequire,
        req = requirejsVars.require,
        def = requirejsVars.define,
        fs = nodeReq('f
        }

        if (conf define = undefined;

   /gets replaced. Used in    exec = function (string, name) {
     ding) {
                //A file read f                             name ? fs.realpathSe RequireJS node Copyright (c) 2010-2011, The Dojo Foundation All Right      });
        }
        return tar    try {
              corresponding to the0      nction/
        function getScriptData      tion {
 ry.gea.b.c'.
    functioc{
                    //Just 
    req     equire.nodeReqd, a of ry.splice(i, 1);
       {
           y arg     noLoads = [],
   ly argument to require is a string, return g;
    }

    /**
     * Constructs an error wrequirejsVars.define,
        fs = nodeReq('fs'),
        path = nodeReq('path'),
   h'),
        vm = nodeReq('vm'),
        //In Node 0.7+ existsSync is on fse strict';

    var nodeReq = requirejsVars.nodeRequire,
              directory. The general
 * node aduirejsVars.nodeRequire,
           }

                if ();

           shim;
            *
     * Cr{
  gObj } : pkgObj;
                      failed: ' + e);
                }
            },

         corresponding to      //dotor,
docuefined.
     plain URLs like nameToUrl.
                     inStr target for Firefox 2.0's t will
        eParts = baseParts.slice(0, basePar

    /**
     * Main entry point.
     *
     * eq = requirejs = function (deps, calo
   off evaluaeObj.paseName)) {
                        //If the baseName is a e name with.
                        normalizedBasePmalizedBaseParts = baseParts = [baseName];
                                } else {
                        //Conver    //Convert baseName to array, and lop off the lashim.deps || []), shim.exportsFn]);
        .map.isDefine && !this.igntive script so a script node is not held onto for
              this.requirejsVars.notory' and);
    } else if (env === 'node') {
    ! * SuppindexOf('.ttp://githubj;
  us                  inStream.ini //Now that plugin is loaded, can regenerate tMap
                        //to get the final, normalized ID.
   > 0; i -= 1) {
                    nameSe     // No baseName, so/[^.]originalName, relModuleMap, false, true);
   i -= 2;
  , so can do  moduleName = moduleMap.id;
             }
    , so can do
                        //Try tuirejsVars.nodeRequire,
        req = r    //Set up with config info.                               assumed to have already been ation;

                           throw new Error((fileOd.
 * Available via the MIT or new!(tlse {
    g object
    if (typeo" + moduleName + " is not allowe  //Removequirejs for de          }
   int regexp: false */
/*global requim now* Supps adapter          }

          req = requirejsVars.require,
        ed to redfine a consol                   require([mos adapter assueName];
        } else {
        tarI,
s adaptercan do the next thing safely.
                        };

    reqfined[moduleName];
                } finall    };

    req        context.nextTick = oldTic.
                    //Add extenses that xtion.es. This adapter just allows limited RequireJS
 * usage from wi) {
ntPacka, callback) {    ext = moduleNamePlusExt.substring(induirejs = functionSide ork. Detie exequire.load ) {
can regpath. Us                  //finish synch r.js 2.1.8 Copy @license RequireJS node Copyright (c) 2010-2011, The Dojths = config.paths;
              ow that plugin is loaded, can regurl)) {
            contents = fs.readFileSync(url, 'utf8');

                      deps = null;
 Tick = oldTick;
                }
        //Re && (ary[2     ..' || ary[0] === '..')) {
       normalizedMod.on(index !==        ath segment at the front so iror((this.error = enodeShim)  err.oline. Keep at least one non-     err = new Erroule is being deTick = oldTick;
                }
       !!prot work. Detec                     }
 me === "exports" || modu) {
    func   return config.urlArgs ? url +
   ame)def                       //synchronouslxy or may not work. Des limited RequireJS
 * usage from wi  def(module      xthat x.js has loaded it and set up
 * somnspilp //wai, /**
        Id = map.id;

                //Skip things that are not enabrighttive to the ed[depId]);
                          /make it relative to the URL of the item requesting it
                /p.paf the i                 //Choolso, if rela            parentMap = map && map.par  def(moduleName, function () {
           er is r.js.
 */

(function () {
    'use s++i         * load call.
             * @param {String} moduleName the name of the mogistry, moduleName) &&
                            context.  def(moduleNamd) {
                         empora= moduleName) {
                        [NamePlusExt.length);
                    return (context.config.nodeRequ                            originalName =o
            //allow overriding in ]     context.nextTick = oldTick;
                }
      odule name segment, see if there is a  def(moduleNam allows for anonym//registered for it. Start with most specinal name, - 1; i > -Also, if relative,
                //make it  }
        }

        return ret;
    };

    req.nextTick = function (fn) {
        process.                'wi
                    err.originalError riginalName 
    req.nextTick = function (fn) {
        process.ives later execuagedy, detec                 originalName = dirN') + '/' + originalName;
                }

 callboUrl(nor
        /**
 * @license RequireJS       i
        //Support anonymous modules.
        context.completeLonextTick(fn);
    };

    //Add wrapper around the code so that it gets the req, [data            //otherwise,                     //Some defines could hansformed
                       this is some other anonp-level r callb  //waiting for its completeLoad to fi          ttp://github.com/jrburk-1)    splice(0, i, pkgPath);
    deps.
  sArray(callback)) {
            
            t to  ? MAPssue #39     * makeModuleMap(iry {
                    return (context.config.node           }

                //Do .
                oldTickapper around the code so that it gets the req.hasO                connextTick(fn);
    };

    //A       if (moduleName === * @license    //for applying map config again eip = Object.prototype,
passed in again, 
 * Available via the MIT or new BSD licen          h, not module fig, mod               var id = depMap                  fileName = 'main.js'      nameParts[0];
                               //Name))) {
 || Loads the , hold on
            //t       //Mark all the depe  * Loads Don't
        //e = config.scre lib= require;
     f (!rs_fou     0the Med in   var url, pluginModu    try {
 { return value; }, null, {
                            enabled: true
         //like Joyent where it defaupyright (c) 2010-2011, Thequirejs !== 'undefined') {
  contains . or ..
        m++ licenseript attribute, which could also                    if (convertStream) {
     /In Node 0.7+ existsLoads the libLoads the l&&D license.>ep at least one non-context.nextTick = syncTick;
                try leteLoad(moduleName);
    };

}());
    } else if (env === 'node') {
        this.requirejsVarpplied to this require
             
          req
        /**
 * @license RequireJS node Co= e;
                    err.moduleName = originalName;
                    return req.onErnable the module
                      s limited RequireJS
 * usage frohe Dojoequire.load = function (context, modu env = 'node';
    } else if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
            (typeof    tScripts dLib() {
        /**
 * b.com/jrburke/requirejs for details
 */

/*jslint regexp: false */
/*global require: =4
 */o cs adapter assumes = map && map.originalName;

       t modIT or n                      relMap &&= map && map.originalName;

                   so c        config = deps;
                           lse {
                     }
        }

        function remo it,
               map.id] = {});
         e that is desired
     ct Ar_requireJsBuives later execu     {
        throw err;
es the
            //basecontext') === context.c  paths = config.paths;
              ('{') === -1) {
                  return prefix + env + '/';
                }     req([name], function (mod) {
                load(mod);
            })!        'node';
    } else if ((typeof navigator !== 'undefined' && typeos array or a config callba(originalName);
                } catch (e) {
                   parentPath = parentPa      url + ' then tried node\'s requath.existsSync,
        hasOwn = Object.prototype.hasOwnnextTick(fn);
    };

    //Add wrapper around the        if (moduleName ==        cript. But only do it if thmap.unnormMIT or ned]);
                      at it s     //Mark all the depe, req, lolue, force, de           //on context.
     code without having to know thedule via Nmozilifo path tha            execCb: function (namto one moT_CHARACs adapter ass+ ' then tried node\'s requop) {
 t
      ws limited RequireJS
 * usage fro=4
 *omma false);

                  require("' +
                            tragedy, },

                    specified: fuess.nodeSh               return localRequire;
t) {equire       //Allow override in the conq, load, perf issues.
        rea
                    return;
                }

      req.onErrorame) &&
                 /**
 * @licensefor (var i = 0; i < self.body.length; ) {
/**
 * @license ll Rights Reif ( (c) 2010[i] instanceof AST_SimpleStatemente Dojo Foundation All Rights Resjrbu2.1.expr =t (c) 2010[i] 2010, sym, assign;.
 * see: http://github.com/jrburerveequirle via the MIT AThis  &&requi.operator == "="line(sym =e
 * ileft)ble via the MIT oymbollinevars.hasno o.name)nse.
 * see: http://github.com/jrburrburke/rdef =the togetevel
 * diis a bootstrap script to allow run runningdef.value) breakis
 * the shell of the r.js file.
 */
slint evir Node erightis
 * the shell of the r.js file.
 */
removejslis,al r is
 * the shell of the r.js file.
 */
nsol.pushjsli is
 * the shell of the r.js file.
 */
 (c) 2010-splice(i, 1 is
 * the shell of the r.js file.
 */
continueis a bootstrap script to allow run}s a bootstrap script to allow running RequireJS in the coSeq/Rhin This r Node ecaronment. It is modmmand line This in either a Java/Rhino or N existsnvironment. It is modified by the top-level
 * dist.js file to inject other files to completely enable this file. It is
 * the shell of the r.js file.
 */

/*jslint evil: true, nomen: true, sloppy: true */
/*global readFile:  exists process: false, Packages: false, print: false,
console: false, java: false, module: false, requirejsVars, navigator,
document, importScripts, self, location, ails
 */ dir, noddrileUtils */

var requirejs, require, define, xpcUtil;
(function (console, args, readFileFunc) {
    var fileNareadFileFunc) {
    var fileNaerved.
 * Available via the MIT Empty BSD license.
 * see: http://github.com/jrburocation, Components, FileUtils */

var requirejs, requirefine, xpcUtil;
(function (console, ar 'undefined') ||
            (typeof importScripts !== 'undefiBlock BSD license.
 * see: http://github.com/jrburke/rtmp = [ ts,  ].concated.
 * Availa 2010 is
 * the shell of the r.js file.
ocation, Compone.applyed.
 * Ava, = f   readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        e true, nomen: true, sloppy: trureadFileFunc) {
    var finsol = make_node(MIT Var,owser, Dojo Foundation All Rights Resdefinitions:') ==s[0];

        if (fileNam is
 * the shell of the r.jhoistedars, navis is
 * the shell of thereadFileFunc) {
  readFileFunc) {
   (c) 2010 = dirs{
      contextommande.log('x.js exists nreadFileFunc) returnory.gis a boots
        //SOPT     or new BSD lice, func    ed.
 , compressore Dojo Foundatioerveull);
    .op name"side_effects"ist.js file to injecterve! (c) 2010-has_Name) {
    (ist.js file to inject othts = functiwarn("Dropping Name- {
   -free sBSD lice [{file}:{line},{col}]"
      start is
 * the shell of the{
     ) {
          ned' && typeofommand is
 * the shell ofreadFileFunc) string, name) {
            return rhinoContext.evaluatDWLooptring, name, 0, null);
        };

        2.1.condrejs forpeof     .et evatests = funct is
 * the shelocess !== 'und =ypeof[0]is a bootstrapva.iots = function (fileloop     {
            return     existsnd-2012,  > 1      return (new java.ide) {1]e Dojo Foundation All Rined') {
            cFocommandOption = fileName.substring(2010:ory.getGloinoContext = Packages.       log: function else(typeof iuireJS in the coWhilee Dojo Foundation All Riexists = function (filedead_code        return (new ja else if (tyaunct        env = 'main;

     extract_declara     _from_unreachablee;
  sts = funct
        ex, a is
 * the shell of the r.jned') {
            c      return eommandOption = fileName.substring(1);
re('paaame = args[1];
        }

        //Set up execut.org.mozilla.javascript.ContextFstring, name) {
            return rhinoContexting, nam if_ true_in_e fse, 0, null);
        };

         vm.runIndrop_it(resense.
 * see: http://    ib/xp_
        _array      is a bootstrap screrved.
 * Avastring) {
            return eval(string);
        };
ry.getGlobal (c) 2010-clone( is
 * the shell of the (c) 2010-tGlobal    {
            conion, Coponen1)        };


        fileName = ForNode(fileNtransform& process.versions && !!prfs.
       me) {
            return existsFor = undefined;
        define = und to defvm');
        path = require('pa         //In Node 0.7+ eximmandOption = fileName.substring(1);
    ync(name) : '');
  isContext(this.requirejsVars.reqc = function (string, name) 2.1.fir         };

        exists = function (file ?ileName = proce[0] path');
          env = 'nodemponenle via the MIT If      return (new java.impone};

        exists = ftruelinets = functie fsefinrol_tarhis        com.label) ==ts.clac || path.existsSync;

     ocess !== 'unde Dojo Foundation All Rightsocess.versions.no = undefined;
 inar/

/cess !== 'undOption = fileName.substring(1);
nvirpath');          ojo Foundation All Rights Resn either: "&&"lize on front slashes
         proc:ompones !== 'undeneg' && process.veath) {
            return fs.readFileSync(path, 'u        fileName = process.aeturn FileUtils.getFiThere has to be an easier way to ds.readFileSync(path, 'utf8');
        };1);
 ng),
  There alternativt is
 * the shell of        exi                 mandOption = fileName.substring(1);
            fileName = ar           ];
        }

        xpcUtil = {
            cwd: function () {
                return FileUtils.getFile("CurWorkD", []).path;
            },

            //Remove . and .. from paths, normalize on front slashes
            normalize: function (path) {
                //There has to beo this.
                var i, part, ary,
                    firstChar = path.charAt(0);

                if (fir                       firstChar !== '\\' &&
             .log('x.js exists not a

        exec = functio Component.evaluattsSyntring, name, 0, null);
        };

        exis';

        //Get the fs module via Node's require befstsFo= MIT       .prototypeion (mize.callrce://gre/modules/FileUtils.jsm' existsForNode = fs.existsSync || path.existsSync'import']('resource://gre/modules/FileUtils.jsm' new FileUt);
        vm = require('

   mmandOption = fileName.substring(1);string, name) {
            return rhinoContext.evaluat= req }
            };
        }
    } else if (typeof process !== 'und catch (e) {
     it
 e Dojo Foundation Alpeof prit
  fined' && process.versions && !!pr!!process.versions.node) {
        env = ' Components.utth) {
                try {
                    return newStream,
                    ore it
        //geline!uire/node.js
        fs = requi       nodeRequire = require;
        nodeDefine = define;
        reqMain = require.main;

      erved.
 *    ble via the MIT oBSD license.
 * see: http://github.com/jaars, n          is
 * the shell of the r.j        existsF      lla.org/intl/converter-input-stream;1') {
          eString(this, strstance(CiOption = fileName.substring(1);
equire('path');    return fs.readFileSync(path, 'fileName.indexOf('-') ==leName && fileName.indexOf('-'  //Temporarily hide require and define to allow require.js to define
        //them.
        require = undefined;
        define = undefined;

        readFile = function (path) {
            return fs.readFileSync(path, 'utf8');
        };

        exec = function (s'import']('resource://gre/modules/FileUtils.jsm'{
            return rhinoContext.evaluatIf       },

            xpfile: function (path) {
                tr !== 'undal module via Node's require bef (typeof process !== 'undefined' && process.versions && !!process.versions.node) {
        env = 'nodeit
        //gets replaced. Used in require/node.js
        fs = requiine a console.logCversions.always true//get fancy though.
        if !== 'unde (typeof console === 'undefieInstance(Ci.nsIFileInputStream);
                    inStream.init(fileObj, 1, 0, false);

                          p Dojo Foundation All Rights Res  //Temporarily hide require and define to allow require.js            efine
        //them.
        readFileFunc) {
    var fiream;1']
   .log('x.js exists not applicablrequire = undefined;
        define = undefined;

        readFile = function (path) {
            return fmmandOption = fileName.substring(1);
   h, 'utf8');
        };
        fileName = process.ae) {
            return xpcUtil.xpfa    fileName).exists();
        };

        //Define a console.log for easier logging. Don't
        //get fancy though.
        if (typeof console === 'undefined') {
    //Temporarily hide require and define to allow require.js to define
        //them.
                  console = {
ream;1']
              path.indexOf(':') =S 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */         //XPCOM, you so crazy
is_eed'  interactiveScript)nts);
            = null      }
          an easf process !== 'undetChar !== '/' &&
                op = Objec_is_b      asOw_of   cwd: functio, = Objec     }= Objec catch (e) {
          currDirRegEx&&asOwn = op.hasOw{
                losOwn = op.hasOwnPrand cis a bootstrap scrocess.versions.no
        apsp = ap.sp exists = funce = args[0];

        ireturn existsForNode(currDirRegEx||{
            console = {
                           currDirRegExp tmp          //XPCOM, you so crazy
sSuffixRegExp .log(ser sSuffixRegExp = /\.js$/,
                       d') {
            ctStream.init(inStream,          },

            //Removre('path');ce(i, 1);
                ense.
 * see: http://github.com/jrburkCOM, you so crazy
    };

        exists = or new BSD liceser loaded and complele via the MIT or new BSD license.
 * see: http://ow
        //to feature test w/o causing p.
        readyRegExp = isBrow) {
          return xpalommandOption = fileName.substring( !== 'undrom paths, normalize on front slashes
    consequenfrom pat if (filelize on front slashes
               path');            
        //In Node 0.7+ exior.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^sSuffixRegExp = /\.js$/,
 ame = '_'lete|loaded)$/,
        defContextNlla.org/network/file-inp= !!(typeof windoisOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() []).path;
 !== 'undefined' && Component    normali||: function (path) {
       .. fro= Objeclize on front slashes
         //      if (filel(it) === '[object Function]';
    }

    function isArray(it) {
        retur of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString()) {
        if (ary) {
            var i;
         ze: function (path) {
       .. from paths, normalize on front slashes
    && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    /^complete$/ : /^(complete|loaded)$/,
    ned' && typeofame = '_',
        //me = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString()) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i +=se(ary, func) {
        if (ary) {
            var iturn ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it)y)) {
                    xiName = '_',
        //Oh the tragedy,;
        for2010-TYPE a Jlue. If the funct pronate, but not sure how
        //to f (c) 2010-CTORommandOption = fileName.substrt eviopera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = adFilete, but need to wUn     ;

        exemalize(pa& process.vee;

    function isFunction(it) {
        return ostringy have a property of the same name.
              p    function mixin(tareturns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var propIf      (c) 2010- }
                   console = {
                lon FileUtils.getFile("CurWorkD", []).path;
            },

            //Remov    normalize: function (path) {
   .. from paths, normalize on front slashes
&& func(ary[i], i& navigator.platform === 'PLAYSTATION 3' ?
                     return existsForNode(fileNrgs[0];

        iCOM, you so crazy
aborts                 return (new java.i      console = {
                log: f     lents.clas                  };


        fileNamcurrDirRegExp = /^\.\//,
       S 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * re('pa[     ifce i]&& Components.interfaces) {
        env = 'xpconnect';

        Components.utt;
    }

    //Similar to Funk is unfortunate, but not sure h2.1.{
            coe
        //specificallicates loaded and compldocument),
        isWebWorker = !isBrowseop.hasOwn? = Object and calls a fun    ostring = op.toString,
      ecifically. Sequence isction bind(obj, fn) {
require = undefined;
        define = undefined;

        readFil
        };
  {
   
    function scri-= 1) {
                if (ary[i] && func(ary[i], i{
            return rhinoContext.evaluatewitchtring, name, 0, null);
        };

        exis (c) 2010-2012,  a J0.substring(1);
);
                    } See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && oph;
  equiessgator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ r.js ;;) {
        throw err;
 last_branchrejs for detae.
     * @param - 1ain = require.main;erves.org/docs/s specified
    //first, sin
    =js.org/docs/    fi (err) {
              e.requireType = id;
   eElement,    andOption = fileName.sube fs_2010sts = functi            fileNam
   ];
         }

        e.originalErrpop
        };


        fi     e.requireM }

    if (typeDefaul         e.originalError = er{Strn () {
                return FilD loader,
        //do not overw
            return fs.readFileSyn.org.mozilla.javascript.ContextFacto true, nomen: true,);
        Cc = Coexs !== 'un  */
    f{},
                    fileObj = xout:nning Re @param {St2) try                 target[  */
    fr Node{
        env = 'o crazy
                try quire;
       trueig ois a bootstrap scr2.1.adFile: tru[equireType = id;
   2.1.8n_ileUtndow.document),
       Contextb    ontextName) {
        var inCh (typect.pModule, context, handlers,
  opp       checkLoadedTimeoutId,
   rue na     checkLoadedTimeoutId,
   t  ifnew TreeTandOptioer(ing, name    e: fscend,textliindow !== 'undefined' ay. If thod//Oh the tragedy,Lambdae a un faster if there ior new BSD license.
 * see: http://github.cow
    un f i, part, ary,
              ll run faster if there iring} ser =n fa   }

        xpcUtil = {
      ed' &im: {     Name);
        };


        fi1);
  ormalpeed upthi rhinoContext = Packages: './',
   /Defaul?         return hasProp       define =eed upined;

        readFile = function (},
  2010-reducenfig to spa, quireModules = requireModules; baseUrl: './',
   a{
      ) {
        is
 * the shell of the r.js fi}, []do this.
                varse.
 * see: http://github.com/jrburke/require       exiun faster if there iIfefault.
                Try{
                log: functrs,
 agExp ext(c var req, s, head, baseElemxt(cont!eckLoadeis a bootstrap script to a    //registry of just enabled modules, to sp path sents. @license RequireJS 2.1.8 Copyrig             paths: {},
                pkgs: {},
        BSD liceWithB
   fault.
                wing} d .. from an array of path segments.
     t if a .. will become
         eckLoaded, filea .. will become
         * the first path segment, to help with module naLoaded, okups,
         * which act like paths, but can be remapped. But the end result,
         * aleName.sub of         //If a defin},
  ;
        }

        xpcUtil = {
      call(it) xt(c{
                log: function /Defaultsray} ary the array of path seg: './',
                paths: {},
      }
    }

    /** vim: et:t       Loade
     * a=== 1 && (ary[2] === '..' || a         cray} ary the array of path segow
    e(), wh ? MAP.skipcle breaking codeonsole = {
         er = 1,
            unnormalizedCounter = 1;

        k normBdocs/e        parent(             ary.splice(i, 1);
                  
     * afront so var req, s, head, baseElementun faster if there iCas {
                log: function equirejs =},
  fined;
    }

    //Allow for a require confiipt to allow running Re @param <f reing, inStream.available(),
       throw Node's require befdFileSync(path, 'utf8');
        };

        exec 
    } {},
y have a         self !== 'undefined')) {
        env         rt === '..') {
                       //Similar t     )one non-dot
                        //pat        * the first path segment, to help with module         if (i === 1 && (ary[2] === '..' || ath, 'utf8');
        };

        e                 //This can still fail, bme && fileName.indexOf('-')   //registry of just enabled modules, to speed
                paths: {},
   g;
    }

    /**
 is a bootstrap scrtt  //ded, ts = functied naName &&te
        //specifical !== 'unmandOptiontete
        //sp} ca    (exlla.org/network/file-inpex !  }

          exg) {
                //A file read function that can deal with BOMs
 onab            encoding = encoding || "utf-8";= 0) {
     tprocen 'undee.js to def       convertStream.close();
                    }
              T.pat  baseParts = baseName && baseName.split('/'),
                normalizedBaseParts = baseParts,
                map = config.map,
     

    i        .DEFMETHOD("lse,
c_     alizers"starMap = m         ary.spl                .forEachnfig to spavig        ary.splice(l readFile: = /^\.\//,
       turns {Strin          //If have a base name, try toto_ This lice it,
                //otherw                   se, assume it isd.
            enabire that will
         
/*jslint evil:specified
    //first, sin * d readFile: functiified Refis a 
 * dith.
                                           convermmand is a if (ary) {
            var i;
         = for (i = 0; i < ary.length; i +=     
        if (ary) {
            slint evi     //In Node 0.7+ exi   }
                }
          nts = {},
  tive to baseUrl       inStream = Cc['@e)) {
     'undefined') {ormaliza /^\.\//,
       ow
    xec, rh.requifs.reae)) {
      in the end.
          
        ve a base id the error ID that maps to an ID on a web page.
  assume it isr instance, baseName
            console = {
                log: fune read function that can deal with BOMs
  ng, namstarMap = map && map['*'];

            //AdjuseUtils.s no dpcUtil.normalize(path));
                } catch (e) {
     ts = function (fileunused        return (new java.ih;
     //me = '_'o ar.re aferenced
        };

        //Defence the
 global;
        each(val([^'"\s]+)["']\s*\)/g,
     ap, foundI, foundStarMap, starI,
          lltring, name, 0, null);
        };

        exists = function (fileunsaf       nodeDefine = defequirejs = undefined;
   uireType = id;
       rejsment. It is modified Re         unorarilain' module name, so normaliz            * di        ary.splice(i - 1,case "As.re":var req, s, head, baseElement, datargn.
      !=gets replaced. Used in    each(value.split('.'), functiis isommandOption = fileName.substring(1);
documl licesvalue. IrgName = args[1];
        }
 end.
          n} applyMap apply the map config to the va true,         // No baseName, so thObject ID is resolved relative
                    // ed') {
        if (isFunction(re(value.split('.'), functieParts = name.substring(2);
                }
  prn eities: [
    function scripts(fig if available.
            if (applyMap && map && (baseParts || starMap)) {
                namString = name.split('/');

                for (i = namePartow
        //to featur    /ommandOption = fileName.substring(1);
  }
   ""ame = args[1];
        }

        //Set up execution require = undefined;
  {
        if (ary) {
            var ingMixin);
         [0]lize on front slashes
            normali+: function (path) {
                //.
                        for (j = baseParts.length; j > 0 > 0; j -= 1) {
                      t Function]';
    }

   the end.
          // No baseName, so th

       ID is resolved relative
      ));
    segmestarMap = m pkgConfig, mapValue, getOwn(map, basePaxt,
         * all    /am {Boolean} applyMap applyist.js file to inject other filesquire !== 'undefined'  '/' + pkgConfig.mai;
   = "nfig to sp" +Name segmeName &&0, -1).map         enrgst.js file to inject other files to comp= {},
  rgrce) {pcUtil;
(function (console, args, r).join(",") + "){           }
' + id         // .reqrce) {
+ "})()"is a bootstrap script to allow runeName)  ifparstion       //correctly to disrmalizedBasePst.figure_out_scop      registry = {},
        }
             func    Cll);
        //Some use of relative name
         * @param {Strt holda shmandOption = f
                    //if there is a shorter segment match later in a matching
            a shmangle_o arstch later in a matching
                fu(reqa sh   filetivate                  name = pkgr map match, but justrg    fun                        }
, i                        }
                    }.
                        segmeni] (mapValue) {
                      h; j > 0; j -= 

  print_to_s = ma(do this.
                v config if available.
            if (ap = nameParts.join('/');
                }
  
          OutputStreamtch later in a matching
            ed;
        definepcUtil.norme;
  genth));
fu      sePat,
                    //if there is        func.top = ma().replace(/^\{|\}$/g, ""undStarMap = getOwn(starMap, nameSeg }
              convert  }

                          }

      if (foundMap) {
                    na  }
   func            if (foundMap) {
       ('x.js exists not applicable in browser ap) {
     is a bootstrap script to allow runle via Node's require bef                  pkgName, pkgConfig, mapValue,onfig, mapValue, namePale via the JS_Pon t_Err      };

        tNode) {
                 e a console.loghs, id on easi     passed toconfi

      auses
//problems with requirej                   }

      (typeof console === 'undefi strict: uneven strict support iexriptNode.ge is
 * the shell of the r.js file.
             firstChar = path.chaue = [],
       ole.loge, p    if ((typeof navigator !== 'undefined' && typeof document !== 'undefined') ||
         plyMap && map && (baseParts || stb.com/jrburke/requirejs for details
 */
//NotName;
                 Do                y a JaiptNode.a/Rhi      for (i = nameParts.length; i > 0; i -=  baseParts.slice(0, j).join('/'));

                         .. fro.
                        for (j = baseParts.length; j > 0; j -= 1) {
                        ray, and lop off the last  for
                            //this     //      */
    function makeError                    }
                }
      ([^'"\s]+)["']\s*\)/g,
        jts = function (fileName) {
            return (new java.i&& !isFunction(rle via the MIT         r splitPrefix(name) {
   t[proed;
     pcUtil.normName)).exists();th));
    , name];
  ist.js file to inject othow
        //to featue same name.
   {
        return document.getElementsByTagName('script');
    }

   {
            return rhinoContext.evaluatNewname = name.join('/');
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.main) {
                        name = pkgName;
                    }
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so theParts = name.split('/');

     so thRegExp}
         */
        function {
                                so thhs, iized, applyMap) {
            vis is ID is resolved relative
  ow
        //to featu    na*String*/path, /*String?*/encoding) {
         (path, 'utf8');
        };

        exec = function (string, name) {
            return.evaluateeq       },

            xpfile: function (path) {
                trName) {
        le via Node's require before       careName)).exists();
        };

        /2.1.   //This can stillrnal    cwd:d, vm, path, exec,   }
             namor that= "fineon splitPr
       } else i/Rhinfuncy(pathConfi  //no ponment. It is mod    me vx, name];
   {},
            * @param {String} [paren      naule mapping that includes plugin prefix, module
         * name, and casca        nodeDefine = deferved.
 *contexre,
        nodeDefine, name.
   nvireName)).exists();
              //Accequivale ? to      namParts[1];

            if (prefix) {
 a              prefix = normalize(internal name.
            if (!name

         dginModule.normalize) {
 s if thera base name.
            if (name) {
                if (prefix) {
                    if (pluve names.
         * @param {Boolean} isNormali] parearyname, try tolift_  useIce it,
        ull);
        };

        exists = function (fileNarentName  pluginModule = getOwn(d     l
         * also normalizSeqodules = requireModules;
    eq          }

                if (!foundM2.1.x !== q.    s.reaid]);
                rormalizedName = = xader,
        //do not overwx       of just enabled modules, t       to
               x          requireCounter = 1,
            unn{
       q                 pkgConfig = getOwn(config.pkgs, (pkg       return rhinoContext.evaluateturnPostfixstarMap = map && map['*'];

            //A{
         .ame, parentNam!== '/' &&
                      //already be norelized, so do not need to redo that part.
     e, baseName,   nameParts = splitPrefix(normalizenfig.main{
                        name =e
         * name, and booleans") {
 y(pathConfi    (norma_efinex   pr                tar 0) {
 h;
  n either           // No baseN so th! ID is resolved relativName;prefix);
               preline
in either a Ja!"
                baseUrl: './',
                                      firstChar !== '\\' &&s || starMap)) {
          so th.norof ID is resolved relativy(pathConfig) && B(normarequi    namUtil.xpfile(fileName).exists();
        } (typeof console === 'undefined') {
            cTrue             log: function () {
              //normalization, s).joinme via reique ID so two matching relative
      ncat(naoperty,
    , e    ostring = op.to       log: function () {
                    print.apply({},
                 {
        env               r).join normalize(name, parentName, applyMap);
                        });
                    } else {
                        normalnvir normalize(name, parentName, applyMap);
                  nvir          } else {
                    //A regular module.
            ctionmalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. T       normal proc vm, path, exec, rhinoC!normaln either a Ja||"this        if (hasPro&&izedNa!         eName)).exists();
        };

        //Def                process: false, Packages:                  //A regular module.
             = getmalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    /       mut     O either== 0) {
Predic' &&"== {},
!, er= * & | ^remodule') =.evaluat).join('ing, name, 0, null);
        };

         vm.runInreven to     orc Error(path + ' failed: (errbathis       //Account for relative p
   ne:  proceName)).exists();
                    .createInsop       n either a o   //This can still faiScripts !== 'un            mod = getOwn(r {
       !== 'un process: false, Packages:       each is 'loading', 'loadat includes plugin prefix, module
     
        }

      id is a plugin pluginModule = getOwn(define = getOwn(registry, iCoefix)     );
        ;
                      Parts[1];

            if (       of ,ike .dule mapping that includes plugin prefix, modulmalizedName = nameParts[1];
                    isNoName, applyMap);
       omparisoaliz)//If the id is a plugin id that cannot b so th=== ID is resolved rterminelobalQueue items totOwn(define!mod i    ode.gull);
      in is lo each(    */
        functio                       e paths if obalQueuebalDefQue module name, so normalize fon(registry, (globalDefQu.substr    2dule mapping that incl method to transfer glbalQueue items to this cotext's
         * defQueue.
             foundMap = maon takeGl!mod adFile:= "    me naon splitPr = getOwn(registry, itamp it with a       each(n either a Jaormalizing} message human read== pkgName + '/' + pkgConfig                each(izedName = normalize(name,   }
    //Pus      obalDefQueue = [     } else if (name.indexOf('./') ==hecks.
             globalDefQueue = [ the line. Keep at least on error on mproperty of the same name.
   nviro    function mixin(ta var req, s, head, baseElement, datth) {
   if (typeof re (globalDefQue+ Javaisting requirejs instance.
            return;
        }
        cfg = requirejs;
        r url = context.nameToUrl(normalizedName);
                }
            /**
         * Internal method to transfer && ID is resolved relirejslod) {
      {},
                    fileObj = xpcUt   //irejs forobalDef     break;
                    } els     ltream;1']
      ll  }
|| r         ]
      rr exists = function (fileName) {
            d' + (unne, #392, and causes
//problems with requirej (typeof console === 'undefined') {
            cFnd c                name: normalizedName,
                  },
                 * @param {String} [parenrre)) {
        //assum Components.utils['i (dule': function (od) {
                if (modow
    llnfig: function () {
                   s || starMap)) {
      so th||             } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
           'module': function (od) {
                if (mod.module) {
              ||Counter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                  },
           p.url,
                        config: function () {
                            var c,
     mod) {
                if (modg = getOwn(config.pkgs, mod.map.id);
                            // For pack+es, only support config targeted
                            // at the main module.
                            c = pkg ? getOwn(config.config, mod.map.id + '0able via the MIT ot reassig+ '/' + pkg.main) :
         it('error', mod.error);
    od) {
                if (mod.module) {
      + in             extCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
            cfg = requirejs;
        requirejs = undefined' && process.versions && !!pr {
            /gets replaced. Used in reqoperty,
uire))ing*/paarts, i, j,  //ids ire)) {
        //aprefix, parentName, applyMap);
            }

          return (new java.io        * na  //no pa     parentMap: paren//Pus                   if (getOwn(tracemmand as one
                       Object.ptModuleMap] pare      prefi    if (ary) {
            var i;
         !: function (path) {
       normalizedor}
   an easier way to do this.
             
        //Set up executix,
                uay.protog: function () {
                   /If the id is a plugin id that cannot be determin< ID is resolved relativ        ">remodule') === name &&
  prefix && !pluginModule && !isN<        //local var  var map, modI=d, err, usingPathFallback,
    e mapping that includes plugin prefix, module
  uleMap,
          +n context.
                apspror);
          each(getV evi path m"on splitPrfQueue, so cannot ju parentModuleMa                   expired =          */
        functi   * @param {Error} [err] td.requirec = function (string, name) {
            return rhinoContext.evaluatee name wit the error ID that maps to an ID on a web page.
      } else if (name.indexOf('./'letely ine     message human readglobal_    remodule') === name 
/*jsli     &&        @parOwnPefix.
 rence the
Parts[1];

            if (prefi) {
      requi         allow requirate of ata-reo ar                      processed[id] = true;
            }               // No baseN so th      //oned() {
            var mparentModuleMap] parent module map
ix && !pluginModule && !isNNaN   if (!mod.enabled) {
                    rNaN              }

                iIne a bs ID is resolved relativ                    r                     log: function () {
                    print.apply(undefined, arguments);
       e same nameme = name.join('/');
                    if (pkgConfig && name === pkgName + '/' + pkgConfig.maint ma   inCheckLoadfind_  //no MIT ot ma.exports = defined[mod.       ift ma      varidefi].co    //onhSync(name) : '');
    lLoadas one
                     r     me to concat the name wit    if (ary) {
            var io ar:            ray, and lop off the last      : }
   ray, and lop off the last thedef:      d);
                        }
               ref.    //'ma regular module.
              ce   * It will keep aresolve relative names.
         * @param {Boolean} isNormali2.1.ASSIGN_OPSuncti     "-    /    *    %    >>    <<   //lloadi|    ^    &"         env.evaluatbaseNamex = nameParts[0];
                    normalizedName = nameParts[1];
                    isNoire(mod.map));
   a Java/Rhito defQueue, so cannot jusireCounter += 1); = getOwn(registry, i parentModuleMa each(                    //is waiting on a non-p [],
                   the
    member    globalDen either,r unfinishe     }

            //(globalDefQueue.leng               +
            'exports'            if (mod.requ process: false, PaOwn(config.pkgs, (pkgName = name[0]));
                 === '[object  if (inStream) {
                        inStream.close();
                    }
                }
      wn(definedversions.normalize(name, parentName, applyMap);
    airejs for(!value) {efix) {
             ocess.versions.nofor a cycle.
                  prefi', maps to
        (c command/FileUtils.jsm');
        Cc = Copeof process !== 'undefined' && process.versions && !!pr       return eval(string);
        };

        exists = function (fileName) {
            return xpcUtil.xpfile(fileName).exists();
        } (typeof console === 'undefined') {h;
       useIn.substring(1);
            fileName = process.astrict support in browsers, #392, and causes
//problems with requirejhen just try back later.
            if n
    //dot notation, like 'a([^'"\s]+)["']\s*\)/g,
      op = Object.pde) {
     ostring = op.toString,
      een matched de) {
 rray.prototype,
       });

            if (ex         noLoads. === '[object Opera]',
        contexts =
        cf 1) {
                if (ary     useInteracti                   normalizedBaseP(it) {
        re((!expiredD.
         * @returns {String} n, {});
                useIn           expired || usingPathF since rDirRegExp  not already in effect.
             is.eventuire,
        nodeDefine, 
        //Oh the tragedy,mmand line.shim = ge                         n either 
            te is a base name.
              virotion () {
                        checkLobaseName    if (ary) {
            v    normal          this.depMe, force, deepStringMixin);
epMatched = [];      } else {
              era.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInte          t proce;

    function isFunction(it) {
                  procl(it) === '[object Function]';
    }

    loaded modules.
                err = makeError('timeout', 'Load timed' + (u                    if (!mod.inited && expired) {
                l(normaliz) {
                isDefix(name);
               //Figure out the st                  parentMod(pin either a Jav=defin
              !=(globalDefQueue));
       y(pathConfig) && Non- */
ct equality agarefi{
      : {n either} {t evi}auses
//problems with req (ary) {
            var i;
        
         ray, and lop off the last   }
    (expt eviray, and lop off the last et f    e nam.et f.
     */
    function eachin//on this mss t  globalDefQueue = [],
     l/on this mcol.fetched && map.isDefine) {
                               reqCallsu    d);
                            re  }
   +re error l     //In Node 0.7+ existsSync is on fs.
 
        each(value.split('.'), functiod.check(); //pass false?
                    } else {
                        breakCyclor', err);
                    });
                }

       1 -are error lCan happen if there
                //are multiple define calls for the same module. That is not
              Sub            encoding = encoding || "utf-8";

           thirefix.
 ;
            thisate tterval && (context.startT message human read          s.inited) {
          ate thi    Interval) <   //Figure out the stts = function (fileNcrew_ie8izedNaRESERVED_WORDS     }

              //or couldete'. identifier  */
    coul       * @param {String} [parentModuleMap] paDont = nameParts.slice(0, i).join('/'   breakCycle(depnormalizedray, and lop off the last refix.
 :s as Do a copy of the dependency array, so that
             = function (string, name) {
            return vm.runInliteralsext(       }
       on case, but it is also not unexpected.
                if (this.edName);
                }
            }

            /         prefix: prefix,
                name:ve names.
         * @param {Boolean is a
            name =.
                    //Wil        var ids = eSegment cycles, defined callback for a given
         makeMo //export can be called more than on    disabl"us't
 .
          vm.runInSourceMap(s star mf (this.eves star bal( if (ts        if (this.events.   //o    }t part.
      oo += [i] = depExports;orig      eason to keep looking forgenregistry,    MOZ_e;
      .e;
      Gon () {
(      this.depExports star module, set up an es;
   R     rn;
    
   eason to keep looking for    _ma thirn;
        ser =            if (this.fetch    u/conartTime = (n     return vm.runInadd(      ,tion_.
   e mancol,  contager i contr a p               // Nor modcontext         //Not expired, info.stacontext = (ninalPos     F                 ck to pass to lugin mana        //Register for lumnequire(function (err) {
   turns {String} norma      
    fo.      disable the wait ilugin manthis.shiss t || [], bind(this, funcco    s.shi      disable the wait i   //nas.shio ar       defineDep: function (ion () {
.addMar eas              conteion () ed:f (this.events.error) {ss to  manager map, {
                      s for aisable the wait inn map.prefix ? thithis.shi dependency.
                 uire(this.map, {
                        enableBuildCallback: trun map.prefix ? thi      :       n map.prefix ? thimoveSco arive to baseUrl in the end.isable thit('errDojo Foundatioadd:    n map.prefix ?ge //T                //otherw] = true;
 ion () {
he baseName's
       //otherwiptNode.p.id, url);
                }
            },

 riptNode.ge       defineDep: functi}               this.depMatchednfig to sp      this.d2.1.    TO_ME =               Tr && typeofp.id, url);M   * @param {Error} [err] tate(                     context.me nam: my    rme.
ke     are passed in here dirndsModuend                   id = this.mare('parequimoz(M.       false;

    function isFunbpkgNapExports,
   handlerent        depExports = thisf.shily: M    gainstlue)       F      (xports,
       if (!))    },

             Module = function (m             *CkgNaClause) {
                    return;
                    
                var err, cjsModule,
                    id = this.map.id,
                    depExports = thi       pExports,
   param       depExports = this.depExports,
     */
 , ary)) {
           } else if (this.error) {
      ePartsE  breakCycl{
                    return;
               eParts
                var err, cjsModule,
                    id = this.map.id,
                    depExports = thi            Mdule hasi         foundMa could.. from an array of path segmeke         keow getting a global               //nakey..nor     Ienabled. " ?        //:                       if (foundMap)tarMap) {
 Dojo Foundation All Rights Resr, cjsModule,
        key.substring(index + 1, name.s.map.id,
                 t evillize on front slashes
        ke not array, and lop off the last  }

       xports,
  for failur  //Turns a plugin!resourc the line. Keep at least on 0) {
 istenei,
                    rror state.
         ID is resolved relative
  s work.
                 KeyVal  }
/'onojo Foundation All Rights R so thseine) ||
                             t evior that.xports,
     is a bootstrap script to allowrk.
                 SetteraultOnError) {
                          g     try {
                                    exports = context.execCb(id, factory, depExports, exports);
        G              //Turns a plugin!resource to [plugin, resourc               //are multiple define             *SarentNa             //of doing that, skip this work.
    to
               M previously       ports,
      originalNa               M                  //of doing that, skip this work.
       (M.atchu    ?
     ub : have a )   this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (is     ue and expohat would re      cfetc                are passed in here directly, and
xports,
   oPartsdepExports, exports);
                            ing} onab                  //favor that over return valt(value        ter that if (t                                //favor a non-undefined return value over exports use.
                                                 alr       depExports = this.depEModu        t/If setting edefine itself again. If already in the process
 L
        //of doing that, skip this wo= undef = Mrror li       //only do it for definer, cjsModule,
                    id = this.map.id,
              isable the wait in   //Figure out the stet thpe,
ull baseName .initedNulfaultOnErsed[id] = true;
        ormali
   bled or in error state.
     */
     if (!mod.enabled) {
          enablon bind(obj, fn) {
        ret    if (tNode.gultOnError) {
             so thn                       err.requireModules = this.map.isDefine ? [this.map.id] : n                                     er          if (!mod.enabled) {
       urn vet tady thix,
ter tha     )                            1;
                    err.requireModules = this.map.isDefine ? [this.map.id] : nmakeMo {
                     ([^'"\s]+)["']\   if (cjsModuod.ch            FequiMoznot moexports = exporpdat                          if (this.map.isat instead                 //exports already s thiFROM_     TACK[          if (     }

  2) {
        //assumver return val              of      his       //to thL
   edl paths t(contextepMapis.map, this.dV     stDrarily ordefQup.id     M ?      i          (context//is w     ter tha//is wVaris.map, this.d

                 of                      cls no de          clFunargRegistry(id);

                         this.defined = true;De                  }

                          an up
         kgNams.map, this.deName;
          (err     //to fine, x;
                                  cl   }
                var err, cjsModule,
                    id = this.map.id,
                    depExports = thi   //t.onRes   }

        Module = function (map) {
               vm.runIn             i              retundicat with= "= true"i) {         with      //to thrts;

          of file(:   checkLoadedTimeou   }

       }

   ined =tamp it wither tha be normaliz
                   r, cjsModule,
                    id = thip.id,
                    depExports =    normalM      //If no errback alrea                       argulicen                 urlFetched[url] =      E if (OZ  //               "N
   }
  T_ed f            tracProgramor cyclToplevel,err)dy@ap);= true;
     trac{
       r cycl

        "id>      esults@         retur%
                on(pned' && typeof, 'defiait for complete
         trac when lots of , 'defi when lots of moMap);

                on(p            name = this.maeString(this, str"normalized>
                on(pIf  name = this.ma    " alr>   ap = Arr   } else 
        }     e>
                       on(pepMaps);
        r cyclepMaps);
       , ";
   >;
    retur
                     e of a
        his.maptrue});

                      on(pycle.
            r cyclycle.
  r that
                    //nohat   name = this.mahat , "      >previously,          //If current map       .parentMap ? thising} id"discriminan               so s

                on(pRt('er  name = this.ma      , "ark this>t evi             on(pT      name = this.mame) {lugin.normalize(name, function (natsSyn (this.map.unnorm      ext.makeRequire(m         //If current map Do parentName, true);
 Do                      }) || '';
             For  name = this.ma= reqsDefi> encodxt.makeRequire(muefine>stepefix and name should already beI               na     });
ef         proc>           }) || '';
              ebuggee normalized, no                     on(pluginMapinished the         s(), (this, function (plugin) {
                    var lo                tMap);
     com"orarily hide@                                   'defined'orind(this, D;
  (this, fun     ize(name, function (nameis         },        f just enable tracuse o                 use of "        @                     on(pluginMap                 ned', bind(this, function (plugin) {
                    var lo).join                 ).join('"n either=        }
edMapetchekeModul proc             on(pmmand lice                  aseNamezedMap.id);
                        if (normalizedMod) {
  Logical getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
  out for mod                 out for modulext.makeRequire(map.parentMa   } else 
                            enableBuildNew                 the I"h));ee             ark this (pluue
                                        narr) {
                                    this vm.runInodule,
        moz     hat part.
                if (T     Dojo Foundation Al   //o       .loc               im.deps   if (cjsModule &ss to                      return; deps.
                    = bin               load = bind(this,          if (cjsModule &pos          this, //Map already normal }, null, {
                       urlFetched[url] =         }
                          normalizedMod.enable();
                        }

                        return;
                    }

                    load = bind(e
   unction (value) {
                        this.init([    ction () { return value; }, null, {
 mali                     enabled: truend                     });
                    ap    .nor, my
         plugin to load it n2.1.mozundIthat."                      ow.
       (M){\n          'expoy, functio},
 dMod.enable      (f (m    r, cjsModule,
           {
     p.id,
                        'expo
       plugi       Compot(/\s*,\s*/)s a top-level requ                  //If tistry = /([a-z0-9$_]+)(=|@|>|%)             /i.exec      ine = false;
          mj, nameS    hs, iit('n't     r  mads as enabise :     Allow plugins to load oistry, on (M.     [ ===how    [2]         3) {
        //assumxOf(id + '_unn   cleamy    :           'exports'         = "@ matching relative
      xOf(id + '_un the+ "if (exports ==          'exports'ormalizedCo*jslint >vil: true */
                        v"xports,
             ame,
                            modul=vil: true */
                        var me,
                            modul%Map = makeModuleMap(moduleName),
                              //ame,
                     e without having to know the
     n either in   }
      //context or how to 'ce multiple definxOf(id + '_unn\n})}mod.map.id.indexOf(id + '      

      ("          odule,
        if (te             setting     it('er        (id + '_    )(        odule,
       }

           ,         ts.slice(0, baseParts.    if (![ow.
   ]             for this plugin, so it
          if (at.
              vm.runInxports,
            normalizeeq.onResourceLors, n         //correctl      ap
      !          ng for IE     r any.
                              if (hasInteer,
        //do n         d || usingPed[url] = cycles.
      mozilla_t holdfig to speed     eachProp(registrnts.    ded,           if (      }

                   reqMain = require.m just hold the end.
                         //Transfer getModule/Prime the system by aseating a mod                explar ["  //AundIhash"y deame] = config.config[moduleName &.confame &.config[moduleNcha/Temst iy de try {
   .config[moduleN                 .config[moduleN     if        } ca.config[moduleNrepeat  */
                  re.config[moduleNalue
  sar urly deval',
       .config[moduleN 1;
          1;
              req.exerg}

        .config[moduleNnoop         .config[moduleNMAP     MAP.config[moduleNrs, _uniq                              */
  _templat}

                                   e,
cturn one,
cor ' + id +
        Sort           if                 et_dif  //'ma

                 e) {
              in
   e         useIn                      req.exunction onEr      unction onEr.config[moduleNall.confi        fromtextevi, namary                 //resource
   EFNODE      oduleM  //resource
  ();
      }

 ();
                       /ed fort anonyed f                  /  name = trt anonyl paths t                  /        );

                       //Bind their           this
        text.completeLoad(mor new BSD lice);

      r new BSD lice  //resource
  walk 'und);

                            / when);

      when                    //Us            localR when lots of                   /ad, normalizedM        ned' && typeoftext.completeLoad(moduleNamehat use );

              hat use                   /epMaps);
                epMaps);
                 //Bind the     of that mo               //Bind theoof that moo                  /     in.load(m                       /F       pluginMhis.pluginMaps[pluginMIport anony },

le(pluginMap, this);itg.confnnormalitext.completeLoad(mot ma);

      t ma                  //Sh(plugin.load(m.enabledme's path.
          no din.load(mapno d                  /Acc
    in.load(m
       his.pluginMaps[plugi
       p.id] = png, nam          //Bind the fuefined calr dep                  /Jum          ent          //could be xitring with xiequire, load, config      fined cal                        //     = true;

    me's path.
         oo        in.load(ma        ea                    truet reliabletrue, nome            /ycle.
  fined calycle.
               var idIatch ((typeotext.completeLoad(moing} );

      ing} = 'string') {
                              //                     //for df (tendencies dof (t             var id,ashandler;

 aw.docume            //              dule.
                                his.pluginMaps[plugi      fined call                     //for d         ndencies do         = makeModuleMap(deVa          Vfix) {
        var id, msred up to              false,
       Deof depMap       dule.
                      Parts[0]modules.
           e  //EnableNeh dependency
       Se                                    
                        );

                cred up to to actually wants to
  ub);

      ub                   od.ch         od.ch                           pre}

              pre             this.depCounrmaliz1;

           rmaliz                    []).pt reliable[]).p                      = '[obje    !this.sk= '[objemodule is enabling,
This          /This is a b is enabling,
s is         /s.re        }));

     eParts         ePartsif (this.errback) {
                                    if (this.errback) {
     == def               == defif (this.errback) {
                                if (this.errback) {
                                pMap.id);

         fied );

      fied ial modules like 'require
                         //Alsial modules like 'requiredefined', bi, don't call edefined', bial modules like 'require            ses.
    ial modules like 'require         !this, id) && moial modules like 'require  }

         //impor  }

  it is already enabled,
   dependenciescalling cheial modules like 'require mentioning thale each plug (!hasProp(handlers, id) &             ependency
 me's path.
             in.load(map.naial modules like 'requireR       this//is waitme's path.
                         luginMap= true;

            i           !mo                        augin.load(m        text.completeLoad(mod  return ndMap = mapValues.
           .requiandlers,      ing zero.
           keModthis.enablkeMo        }));

      tom          tom           }));

               cb)            }));

   aN        thaN                         //on

            //o           }));

  Ho           [nam            if (type         depMap =                           ));
    reliable(normahis.pluginMaps[plugind cfined calldow.documeeModuleMap(depM handler;

nctiis.events[name]    Walk         cb(evt);is.events[name]KEY  //o  emi       i  });
                i_ATOMf (name === '     is.events[name]           //o  emi           //oerror') {
              BEFORE_EXPRESSIOvents[steners, since this brokenis.events[name]OPERATOR_CHARremovey around for arror handler was _HEX_NUMBERemove
         deltry.
             OCT    delete this   }
     try.
             DEC    delete thisn callGetM      //can stay arounda while in thestry.
          WHITESPACE for a whilf (!hasProp(defiis.events[name]PUNC since this broken ModuModule(makeModuleMap(a            getModulfor a whil);
       rror handler was GEXP_MODIFIE alreadtion removeListeis.events[name]UNICleMap);
       is.events[name]is_l          e of IE9
achEvent because odigpCount chEvent/achEvent because oalphan    ic_ tryaddEventere
            /achEvent because ounifunc_combin    marp, i) chEvent && !isOpera) {
    if (node.detachEvent && !innector_png, u          hrow an error, which will be
   achEvent because o enabled.          enabled.           if (ieName) {
    ule,
                 noule,
 de.detachEvent(ieName, func);   //in this         node.rde.detachEvent(ieName, func);
   return  as enabled. However                g.patjs_r.requi     nt from a scriis.events[name]onfig.paths, ipt noonfig.paths, iis.events[name]js_e     * aneners onachEvent because o        }

       is.events[name]EX_EOF evt
ject}
is.events[name]     inst evt
on getScr ieName) {
      ARY_PREFIX //Favoing curren
            //Using cOSTrentTarget inst.0's sis.events[name], nfinMENT  emit:sers wil            getMRECEDENCMap);
as easy enis.events[name]STATE wilS_WITH_LABELremoveand still makes sense.is.events[name],TOMIC  ifRT_TOKEvents[n| evt.srcElement;  * Given an event fpt node, g                 cb       //co
               //co  //to support aalling c
     alling cis.events[name]base54 evt
ener(n      //can stay
        fu while
        fuis.events[name]g, then fa evt
g, then fa  //to support a;
      
     ;
      ;
})({}t,
                /in the molar ;
}pathC
2.1.UglifyJed
   };
  .    func;

    func.nce for
 le.l_ vm.runIn      //it.txating ovelo    .rs on("u   fujs2 WARN   //cefin;
};

//JRB: moveLisDodule UGLIFY SOURCE
//to take a this.r.jsthe }

 ,     the    t tenabledmodul   //to b    atue;
 .
n intakeminifoad.id, url);et fs,tartTimerce,
         epCount -=
         1;
                    thisoutAttribute        this modu                             innull) {
                   settror);
 Mismand c this module.lings     odule: ' + args[at);
         : {.exports = o
     else {
            }
 y(pathColse {
                   no  err.h) {
lint 
       as a depe        [functio]Error) // 1.ode, g     for menabledat.
         h) {
s a top-level requet f){
                   rn;
     s define(             ?  }
              : rjsFile.readtext   }
, "utf8= true;
    rgs);
     
         on to it,        this.depExpo   //t           config:   /ing anodule, set up an ergs);
  :,
         id: (prefix ?
          // 2.factory. zed by thrn;
    y(pathCo) {
            actory. S= {args.lenghed: urlFergs.lengt           
              this mod                  ntry: registry,
   horter segment match later in         
        g, then favor over r the context.
    tData.
     mandOptionsq
          makeMo3.      }keModuleMap,
    t);
         normaems get proter segment match later inonfigure:ue and ode.r_frarentNA regular modonfigure:t);
         he baseUrl endsg) {
           4.       tModule(aext.st of 'one/t      {
  /';
        uleMap,
    ismatch', '       norma        contextName,
        }

                registry: re normuleMap,
    == null) {
 ) += '/'
        e;
       Dojo Found  return;
    == null) {
                       this modu
     configur           normalized b                     textd
  p                       puating over an/**
             confa configur  confiprocessing,
rs,
    fuditive.
    

        fun
            onfigure:0, fo(

           true;
                :;

     + ");
        
   cle bp     rocessow.
    on intakelue.ribe           //it.    //odeWrapper(strioitem(hichg.map) {
        };
ub             confihich.SUBCLASSESs a top-level requ             confi     ub[      promText                        aliz      config.ma      ;
             nit t     ELF_PROPS     //and baseP         i    mixin(conf                      m         }g[prop], value, p = {}s;
        confitem by creatp) {
  }e;
     it('errtrue, t
            var )    ue;
 }
      whi              if (!config.ma                       eachProp(cfg,{ beautify:      alized b                                   p) {
      /    rop], val{Object} cfg cotrue);
                modu                  at part.
            !/^\$/ports/Allow plugins te multiple d
       n.
      , valDojo Foundatio   /spibuta require config o.with      sfunction () options.ignore;

               }
           fou                .createInsi)  };
                                //NormaAllow plugins to load oe multiple define   urlFetched[url] =          doc thisd', b                 };
                        }0, fou */
     shim[id] = value;}
                        shi        } else {
                     };
                        }
    Loade              if ((value.expo               }
                    e.exportsFn) {
              }inenab regular module.
       true, true);
 r location;

           new    uld have option to i                  }
                   co
                });

              if{
      ow.
       **
 * @ponense Copy      (c) 2010-2011, The Dojo Foundd', b All Rprocs Reserved.ce cAvaildefi viany reMIT o    w BSD rrentPaig.pksee: http://github    /jrburke/(cfgirejsre andetails
 */

/*jslint pluspkgsm, func*/
/*e;

         odule:      ate of('de, g', ['./esprimaAdapter', 'lang']ules: ' +  (me,
   ,     sary.
  '  this.dep'Error)           s.reTptNode.gdepId{
                     '['       deps: vmove leading dorr.reqys a top-level req (     foundStarMap;
               += (i     ? ',' : ''    '"' +catio.jsEscape/and        tive to baseUrl in the end.                += ']         a brand new opre;
             , thi
      a fiaved off bec     JSL    atchl      makeMab{
  objMark thiss u    as 'rnd conf word'fg.shim) arg    N  //na'main')
          //     (unne,
    exa newre anyra     namets  }
               replacee(eMap(mapvisiugin id that caan erro, childError) {
  rnal        hat part.
           ating a modu               };
  th));
    }
 //Done     and c       normalizedMod.enndow.document),           .js rrorin                      //ask Partsules.
                                  r
   {
  Parts[key) {
        //assume ite
       //upd== 'te the'is.de //upback                      .createIns                  };
           config.pkgs = pkgs.pkgs = pkgs;
                }

 Sync(path, 'utf8');
        };

        exec = functioe norma
       Like         , but   };
          namand cajus && Co//    ssed.
 subton'tanalysi    otny re     of hey          };
inggExp, '')
             Broad           };
                    });

                    //Done with modifications, assing packages back to context config
                    config.pkgs = pkgs;
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
            eachProp(registry  }
                }
                return aryte to moince   }* Pullsew obdepe    ciesous d         //export 
        file nam      sgExp,  * Iffile nam.
      , will      values muo this.dng
     sf th functio this m* t so easiother     valuey re     ion fn()    },

@esult {ed f}      a{
         pply(global, argit('ers {     }: functiono
       tion fn() {
 eInteis;
     ;

 fQueuit mrmalalue.in         wasent.
as = i  //sin*   makeShi.apply(gl/              ntervaidDepal name   //Save ofnal      fault.
      back'               '

                e with modifications, assing packages back letelye);
 Mainring' ? {         func.som           (    e any "waiting to ex            = '       ' that will
           p       ns.ent evil.emit('defined', this.expnError) {
        }
tion@param ?       && mod      cbs }
            },

Maodulon t         .       s afile namof anyn fn;
 ge conf or              age conf     h));fixR(typ     one JavaScript    })(t
     ion fn() guments)      } module(curry return o      ed.
 rermal)
       s = cion fn() {te.exagesproccreat/Mak 1;
   ion(cal
       ee.exnt.
    alame,yre any r    },

equir , thiallows  if (ily    c      makeShimExpoor builds. O    wind iid.fetch*ny remain      hag') ge conf()     
    pecial  makeShimExp  varnt.
bire|exporested, gerefleclar d           varcome befo    ts        //thi                       return onErr                      reet f                        return h    )
                  eParts} defQueueon (fial             ertNeeds     em, func  va    },

add       to Caveat:.nous access  iff ap    riatire call')      retu      reJSlid call
     ansfo   }
if n is
     f (isFunction(callback)) {
          r    unfig.       makeRequire:  on toturn onErr,urn handllRequi]);
                   this.depCount -=epCount ||     ring' ? {//Set up    })(t     errback) {
  i,akeErro      depe.getAt        //that rn o (re      = depExports;
es    = '' = makeModuleMap(depLt thlMap, false, true)            like . = makeModuleMastrn on=        fined:             nError) {
  typeo.recu    id)) {
        locah));re);
 configrce,
      ction localRequir                         sFunctio       ay splice in the values sinnit tame "' BuildCon(cal,
   (!     fault for coturn onErristry,
                        if (ndow.document),
   " has not been load     /may have changed.
 //I             akeError('re        makeShimExp      (isFuncequire([])'))lid requi/        keError('reurn reqmakeModuleMap(deps, relMap(deps, r{
                       var        fileName = proce id = map.teractDojo Foundation All Rirl]) {
      if (cjsModule &&
      
   pName = args[1];
  e multiple define             ')));
     }
      retiente +
 et idegExdeep    unl makeModefined[id];
e
      on ilicitly waInvaldefi    ould               value =!rn;
      ndNetextD makeShimEx      }

                               }

   chronous accessser = us accesse with modificatio     e nas
                       turn onErro    );have differkages back to cwaiting in @param te, );

      2012,   notified = fals.js 8 Copyrightll for dependenci; i++/may have changed.
           es waitinmap.[i) {
        //assume it      machinery used for waiting         \nhave different               (relM[])')));
  ise.exr(makif (keErrore any d requiseParbodulanry)) {
           //"anonymous"              (could      orts:  n      Caveat:      });

        ed y)) {
  aded(ll for                //              onResour             l: true */
              Browser,
          * Converts a{
      ap(deps, rstring' ? { name: pkgObap(deps, relMapled: true
                        });      maponfig[id     //Re   * Converts ae(cfg.deps || [], c          e     naconfig shouser,

        ,' +ojo Foundation All Rights R not suppo+ 'lied to this 
                    i                 !processed[depId]) {
    errback, {
                            enabled: true
          le name. It does not support using
             n URL path.
           meToUrl.
                    ld be app    uleNamePlusExt) {
                       k(function               faul        vk(functr(make         like                          alize   //dots falize)
            },

H          e(jsSapecialError(ivel/If re      if                      rn ret   //noed f              //rthis,) {
                  lbacks
 } onMkgNam'')
      o          (typeofm                         }

 [s star ]dule a     rm              
       epCount em from th   c    ) {
urn req.get(cor(makeError('fQueue.lengexecute",                   }

       odify them, and ignort so    bledRege //sincwuire; worksmodu    e  //since //afterdlers.p    passeduirearg     = valests      uif (es
                       (value) if (v                });

    = makeModuleMhasHa           /&&         has                 //Done with modifications, assing packages back )));
lersAttribu         id    edf thif(     {}    if(   cona-re  //           lue.i//availablbledRegng det so the
      on                ue).id    cute" ableBuildC   localReq,
          }rgv[     && any trailing .js,            //OnuildCallback && callback && io execute"      t it as one
             //T //M }
  lMap.id,ns {String} normal     rror('nop leve                             ueue.
                    intakeDefinesundef = fun     on (id) {
                        //Bind an         define() calls to this context,
  Have a fil           intakeDef   normaltypeoed fExt,
           y, function (mod, id) {
       ions, assing pac       var e = new Erro//If there are any "waiting tng to execute" modules in the registry,
                    //update the maps for them, since tce their info, like URLs to load,
                //may have changed.
                    //chProp(fine() calls to this context,
 as init called, since it is too
                    //lat    if (index !== Determ     
             e of a       conf    odulkeErrorAPIion fn() Specif    ly,   rlook      f (m`      .am    `x);

                             rern handlers[deps](registry[relMap.id]);
                  retuunctionMap(id,meToUrl(normaents.deR     ifuleNamePlusEequire);
             e leading dot in  ret          l.charAt(c                                 re        loca
                   
    (makeha accessAmregististry,
                     /ray} a               //fiStop * Calleahis.load();
           //If module already h        callback.__requireJsBu  rett the
     if (index !== Find  idveat:
""      valuName ade,
monJS                  wra     lue.isFunction(cal{
        act.
  ,on intak        ){})epMap) rodules                  },

  varbe reqome dea    led.d     var         def, whefinedf (mod) {
               es, s
         (modeps ===  }

                            cleanRegistry(id);
  |    }

             :') {
                   re.ini    // while moon tdbstrihey e (as in the Node arn ret || (value.exkeError('re //sinc     (relMap && h Atil.x    },

     ret.init) {
ignorquire;b     @param zerotext.nameToUrl(normagetAn.map           return localRequire;
            },

     id)) {
   e
         ]);
     calls
     ' ?          exports = con                         re  defQu         gment = moduldeflbac                      Fa= sh    )) {
lback.__requireJsBu   */
                     shim.e        n here to keep code compact.
             */
            enable: function (depMap) {         Name         * Inte, giveue.instring(in.events;             * Internal method used ;
         .substring(in                 //If already found a     return ret ||d (value.ex    },

  l.
   . Canpotentimpleially cte.
             */
           eue.leng completeLoad
               {
              shExports =  * ArgL012, Tages back to c
                   rts;

          Dee(cural nam       module,
       )));
nod.
  , st varrequ    
    ard       enatOwn(registry, de           } el   * C val   deford        }
     {
 in |nly    s undefed aName = args[1]//           gs. I     ticul comifon intakerrback)s[id]d reavor                 ovevents;it('erreModul         * Inte, so      requs);
f askontext.na             break;

       ction    shim:ose cal-2012, T];

        if (fi     break;
+
                                      mnctio?      conf      };
   if (  * C"] ID is resolved relative
      if (!f]) the global queue.
          urlFetched[url] = true;
                   * awaii accessed f
   Ap) {
                   if (founormalizatiols/init cuire calls('error', err),
  gment = moduleNa},
   ) {
 ls/init c       }
         enabled.        return;
                

        ntext: ' +
     [replace(curres* th           args = defQueu      * Intell f    var mod = godulwn(registry, depMap.id);
 the reg     ext = module            }
                    };
            
                take                     if (found) {t = m           * Called ue;
                if (hasPathF           0     1module,
           * awaiExports))) {
       l name t{odule,
             J                ntext, deps) {
          gment = moduleNam(), 
                   e)) {
        //assume itrtsFnne, rg0) {
                        } && callback && isFun          e;
  0ding = true;
                ndow.document),
                       });

A               oad callID foe reed b      etModule([module                // jusn]);
                equireType = id;
                checkLallback nly allow undef on tt **does not*      1     checkLoaded();
            },

            /**
             1 Converts a module name to a file path. Supports casesis overriden by
             * the optimizse {
                     'No define           ed.
 eturn conet is
     jsodul   }
cludesuire.get duleName t{
    rl,
            ()     we=== mpact.
   a-re...)s soh;

           jsicates a ers[deps](registry[relMap.id]);
            (as in the Node a    }

 a, syms,        top levuire, {
it
 e reuppo               },

-, syms,:a slash, cthe
       rg (i.e  retu        lLoading           },

         return req. - range:ous
     uleNameretOwdexs somen{
  URLs value.vent cou w     from the sp                l and not a module id.
         //The slash is          (unnathCo  if (m        value.ecialcantrue);
so still{
  ule. If r       }

     to           //Invatext.nameToUrl(norma    C      completeLoad: fue;
            },

          evi    .name] if (found) {jsy non- (erunly non-s[0]    Datao be reRport, quo    = mod      unction (modu= modhis.ch     :\s|\[\s*)(['"])/Prop(defined, id)) {
                            rif (this.events.erroloc, this               }
         * Called otloaded', 'Module 
                       p =  for context, when  confT //toobal(shha
       tive) {
simulate
        .split('/');+
  .split('/');
efin.split(    ing = true;
           here is a path
       js             //registered for it. Start with mosty non-             //registered for it. Start with most som it.
it.
                  

  ]);
                                    {
    moduleName,
           his is ) {
                          },

            /**
            ;
                //Re               }
 tring' ? { name: pkgOb i -= 1)             ror. However,
                      ur
             mport public API.
             */
            nameToUrl: function (modul           intakeDefines    pa   */
          eParts       tive) {
                                            parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desire             try, id);
    i -= 1)  /**
          // Eet tthe
      t || '');
              =                //n lookingthe registry.
= modduledule.
     &&leName + (e[2]//Puss have different be reworked    val('(= '.tPath) {
Ext)'      }

    d[url] = true;
                then asbe reworked., collect themportan        urlduleName === pkg.n: pkg.n it.
                if (in 'string'    nd it
       rg (i.eName maye)) {
ule, url,
        //If 
            holdlativeorarily hvame lookte.
             */
   ay(parentPath)) {
                       if (foun            s/init cid{
                            return onErs needed.or('nodefin                     url += (ext || (js'          contextName eeded             ni  }
        arentModule);
                   ormalizatiol.chapkgObj.location;

   if (index !== RlFetcmpact.
       //If         ire.get ibe ns    .= '.       return config.url         oes *not* do a colonArgs ? uhough. Se;
  agmal) ||     t
          mae                           mandOptio     d re for ' + rback);                               
      enable();
    shxt,  true);
rlFetc

  dulesr new reg;
            },

goos we '&')         null,
stry[relMap.id]);
           /       ourl;
       load: function (id, url), i, pkg        ,ndexOf(      uppotraile
   o This is name, th adapter),f (mod.e         . ?)
                            eToUrl(normali    d = t     js things pass
         ,     }

       irejs                  locrelMap, false, true)odule that needs to be converted to a path.
                    paths = config.paths;
     r(makeError('notloaded', 'Module name "' +
                         may have changeightteractive)    moduleName === //Do truelize(modinhim.deps },

     s
    yction tonot e(js*
             loc         ned, makeMo+:/) ? '' :ed yet fo = optext: 's();

            f baseUrl is   },
                   ind   * h (e)as a separ       enab              } elGo backwarine cr '&'
          ight,tMod namevalue.                           //iat thn This is         },
        moduleName ===   },
                //   /f (hasPathFallback(modIdl-leIas fu=ill [], function () { return value;    deps.
   the1-ener     t 0 cont the result
   d.
            //to suppor     - 1                }

     //              
                   vt.srcElement).r| evt.s       {
  0s[0]        )        toUrl: function (modurn;
               ript node is not held onto for
     eset interactivcript so alize on front slashes
        long.
                    inter                       }
     this.depExpomod,
                 onScripave a file extension alias    */
          var paths, pkgs, pkg, pkgPal    makeShimExp   found = modun module
     gPat    Name      conr neound =  ifonjs         hasProp(handlers, deps)) rn handlers[deps](registry[relMap.id]);
            from a synchronous
             * lo       * Caports &&     f (mod) {
          hts.
 workseizat    iz);
        y      l   }

ID         a bit wonky, onlintakeDefine completeLoad: function (moduleName           }

       {
     ]));
       quence.
             *
             * @private
     eturn onError(makeError('notloaded', 'Module name "' +
                                       id +
                     ]));
        (relMap && h
                    if (config.enfor                   re&& (!shExpakeDefines();

           args = defQueu     CJSthat string iule                   rmh;

           (       allback &his is a bit wonky, onlyjs.id]));
                }
            }
       e leading dot inire = context.mak           * Called to enable a module if it is still in the registry
                or each module name(moduleName)) {
                                                //Mark all the   } else {
                            return onEr         makeError('nodefin                             fication/local scope use.
                         o baseUrl, pull off the    parentModule = syms     }
                }

  nableBuildCallback && callback && isFunis represented bteract

       e(cfg.deps || [], cfg.callback);
               * If the first argument is an array, then           enable();be norm* awaiting e                       if (hasPathFallback(mod     checkLoaded();defined', b  //Find ed.
  ation/local scope use.
               url = syms.join.test(url) || skipEfrom the brow      if (             ..  load* awaiting enablem                 if (hasPathFallback(moduleName)) {
                           o have already be      Queual;
         uire calls,
                   }

        context =        getOwn(contextop lever('nodefine',
      context) {
                     etOwn(context              path
amd              deps = [];
       //'ma     inbject
          ion car(makeErf }

        if (config && config.context) {
            contextName =Name);
        if (!context) .
   context = conteontextName] = req.s.newContext(conteAMD loaders 
                            retunit ca  }

        if ig) {
            conteonfig) {
        return rq.config = function (c            if (Caveat:
 , used and iverride foa colon i for     //If a colon i    }
                        retu        if (found) {ed yet f              expo(moduleName))                         rdized), and to give a short
     * na one was easy enonit tq.config = function (config) {
   ;
           cl) || skipExt ? ''             //registered    * Export requir : '       localRequire.unA                  icates a p    cfg.packages, funcd yet forif it dueue.
               (fn, 4);
    } :Name);
        if (!context) {
  t only if context = paths.
    req.jsExtRegExp =4);
    } : function (fn) { fn(); };

    /**
   ontextName] = req require as a global, but only i   req.isBrow) || skipExt ? '' : '.js'));
            ly if return req(corts some reate defau       && callback && isFun//             //If a colon ;
   req;
    }

    req.version = ver   //Create + 'om it.
             //Have a file extension aliasversion              deps = []tion than setTim// Adjust args if there are dependencies
     rdized), and to give a short
     * name for minification/local s.
     */
    req = requirejs = function (deps, cror(makeError('nodefine',
        var paths, pkgs, pkg);
         ake su).enableup, so just errie(0, i, pkg    url.in optimizer.scaizerr mulitrridgin) {
     f (modonenegistry, i          */
   (curd// Adjust args if tose dependencies are availabsion;

    //U* Called to enable a module if it is still in the registry
             latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defConontext(contextName);Module = syms.slice(0, i).join('/');
 if (baseElement) {
            hLoadableBuildCallback && callback && isFunr that.

                  ror. However,
          n this method is overriden by
             * the optimizsion;

   ig.
                            iinding terride fo({}|[])d bege configs              quire|exports|modAlso(e) {      or object.
 the  } else for sr object     itOnErrortext.nameToUrl(normausesAmdOr       Jo execute when all of those dependencies are availabode  Make a local req variable to help Caja compliance (it assumes things
     * on a r
     ion to exrequire that are not st            // Adj for it.
 require.
    each(isArray(callback)) {
     }
          /');
 '  } elstext,
 ction (prop) {
        exi* awaiting enablement. A second arg, parent,        noenablem 'utf-8';
        node(cfg.packages, funcersion = v                   //Forconsole.log for easieame "'   /**
                      parentModule = syms.slice(0, i).join('/');
                         //pkg = nfig object in arentModule);
   wContext: newContext
    };
o overrntextName = ions || {};

  ist.js file to inject other f       texts instead th the plugin being undefined if the name
   * awaiting enabt');
        node.type = c    /**
     * Doe                  segment = modul" has not been load    !processed[depId]) {
    ode   /**
                  ode         function () {
                   ode [r any deray} ary the array        callback.__requireJsBuxhtml 
     * @param {Error} err the error etch. An ')gistry, d.x =         prelGetM=
        __dir     }__roperly p    ages. Soient.
is.dep get t= '[obje       en
        ates checmod.eve
              */
    req.createNode       eonfig, moduleName, url) {
        var node = config.xhtm   }
  ence.
          his     p load/**
     ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:scripuleMap(map.prefix);

                 \?/.test(ug.basthis can be removed. 4);
    } : function (fn) { fn(); };

    /**
 .
   r('nodefin. Test at/\?/.test(pt-execution urlFetcURL to the module.
           //UNFORT interactiv   //Array splicormalizedCounte/**
     *                                 callback = errback;
                errback = optional         config: {}
              url += (et up loobal require.
    each(Hm
 * scriptthe e)) {
    owserstry, depso d  });

beca cjName = args[1];
  //);

    ode;
    };

    /**
    va         
            //script exeps:/lugin ptextName = config.context;
       efix,t = get                     expontexts, contextName);
        if (!hEvent doe      delete urlFetched[map.ur           //NoNFORTUNATELop(def              return req(s called. So
                (config) {
            c               //natively su    /**
    op(defif we can NOT find [na [native code] theexts[contextName] = req         //https://github.com/jrburke/requirejs/issue.callback) {
                           path. Supports cases where
      ormalizedCounterdized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
       text, use default
        var context, co   /**
     * Any errors that require expl do not  require             '" has not been load so use a script tag
       uire calls //if we canvironments
     * to ovestener support, ray} ary the array of    node.asytions = op         
    IE9+. However/may have changed.
              node = req.createNode(coe(config, moduleName, url);

  source to [plugin, resourcAttribute('data-requirecontext'      // deps is a config object
            con      node.set bit wonky, onl      found = t    * @param  {Fu                               //A script that does not call define(),back/details/648057/scrng the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
 t, use default
        var context, co //Find the right connfig,
             contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(depseof deps !== 'string') {
            // deps is a config object
     * @param {Error} err the error a    /**
cult.
  equi            if (ion(callback)) {
           er,
         null,
                     length);
                a             modulwQueua       d re/The slash is, errbame, (sh              }g defQu
                  ; },siwser
}

     },

                n the     ap) {    s://or('script}
                    retu      rea, prefer that.
   . ?)
                ips = []efore the end
alue for is noload firings
                ot doing the 'scripetOwn(regin play, using appy(exportce spe      ,
       gistrerrilback, e     }ed fence.
         p) {
                          xecute later.
 er case.
     * Make this a separa              d yet for conxt || (/\?/.worker, use importScr : '.                A main:                  ndef',
        'deerride it.
     *
     * @param {Object} context the require  config objec = options || {};

  !processed[depId]) {
   getOwn(pkgs, parentModule);
                        parfici === -1 ? '}
        sepeof    *ronments
     * to override it.
     *
      the moduleName,
    r) {
            //In the bro       function (rel                 i      id +
                          delete defined\w\+\.\-]+:/) ? '' :       to nif (!fou            exports, ar             var config = (context && conthis is lls/i         //            //efr that.egment uleName, url);            equireType = id;etModule           this can be removeollo @param {Object} url the UR      node.type = conNoored on d               //Apply mapfailed forExports ||                   sion;

    //Used explicitly gelative to baseUrlrmalizedCou              oaded();
            },

            /*      callGetModul    // butE 6-8                   failed for        }
        }
    };

 );
       function getInteractiveScript() {
   = opthe call.
        if (!isArra//Athere ar        ad = s.eInteoins . or ..       }

        eachurn interacelative to baseUrl                      ng th              sumed to ha                     then the mod     checkLoaded();
            },

            /**
  eps & rene call  take         //If an array                  [moduleName])me]));
                         pk       exiattribute, whicexpectation that a build has been done so towser) {interactive') {
           return (intera           script);
            }
     Reverse(scripts(), function (sack = optional; for (i = nameof rehe baseUrl.
    if (isBr object.'id'                      //onErrorript's parent.
            if (!head) {
            '" has not been loadowser //Look           moduleName + ' at ' + url,
         cases become common.bal queue.
                 err       && parent.) {
        if (interactiveScript && interactiveScrise if (args some
             * N+
  tus of onta */
   suga  return defined[id]       ,(isBro call for ' +.
    relMap && hasProp  req.jsExtR         if (isArre (defQueue.lengtbute to rate function to allow          * that was loaded.
 y set.
                 //Choose the one that is desired
     becomes ||ibute to       node.type = con   });

 is sto //onhap afteame;MDefore the en

                //Account for anonymous modu      cnts.
    instead URL,) {
     refiea            op leve });
        return interactiveScript;
    }

  rs that require explicitly gollo                  i anonymous modules
             * Doetext.complpply(exports, arme);
            } caed), and to give a short
     * name for minification/local scope us.
     */
    req = reoaded();
          //If mainScript is still a path, fa{
          } else {e = proces      if (req.jsExtRegExp.test(mainScr    * @param {S       useInteractive = tr) {
                    /**
     *         });
  src = mainScript = nul   },
   t in the files to **
             Looknal b a separa          undend ignor         out as ;
            //
    andlers. in browser                     cht = nulny waiting ipt)odules. Differs fro 'compl     node.type = cps://c   * require() in that ae)) {
        //assume it must NOT nati= this.map.parentMa         normalizedC                //node.ig = (context &&aded should
  .
    req({});

    //Expaded should
  'main')
     //in IE8, node.attachEven * name.
     */
   
                //Put the data-main
     * name.
     */
   to load.
                t.
                  **
       omma  return true;
      = doc
        /) {
 d.apply(gg') {
                rm= functi alre    //'madjust ar    llback) {
                    odules. D    //A script that does not call deimulate
              allback, errb& context.config) || {},
                text,
    rt === '..') {
                    if (i ndow.document),
        = context.execCb(id, factory, dError) {
              name s    //If
                baseUrl: './',
   like a module name.
     .completeLo corresponding ed to be reloaded
                            //using a different config.
               ConveGetMame;
       scrip= node;
           byument, iading.
  the spgene'sill passedorts: nododuleN  req.loa
       As    d. Broken              quire,         dument.getEl               re  req.loduleNamePlusExt.substrin                      gScript = node;
          load firings
       ths, parentMto sequence t  req.lorts, args);
      irejso     */
    layer in the ri       in
            onScr               = doLt || ev (readyRegExp.     , set up an errback to pass t
            (readyRegExp.tes       onScr    \n'ed, moduleName) && mod && !                p  futhe        uld u      //to long.
        vt.srcE (readyRegExp.tes] interactive s/to support and                  //Temaultsthe
                //order listed be.
               he CommonJS variables in need      //to long.
       module
                 /ow.
          k though if it jusoncat(deps);
            }
        }

        //If in I     define() caler listed below.
        //Re    * If the first ings
     * on a}
   ack.lengtth = pkg.location;
  [options.ignore;

  nctionthe con() { return value;      name = no +de) {
    the conleName, url);
    funct           syms.sp    },

E //Tems             )
   orts:JS     rnal method used by environment adapters to complete a                 .retion (match, dep) {{
        'data-requireconte.
             */
   LrentPa                 return localRee calls,nextTick: req.nextTa fi null namand alsuband alefined i, jound matching dex     whi', aning dd https://sup we encies, onErr  url b     return (in// }

e     ne, xf passinsoftv      ctdefi        ntext, uound matching deae('data-requirecontsBrot.
 ormalior;

       il.x //e              if (!aepMape;
  ld belinked inte      mapues/187
       t hold              });

                       reies, , this syms = moduleName.portan   paths = config.p, false, true);
                       ex                      //If in EadData =       as fOf('\e !=    -     needs '\rnablen paths are nore ha a files.
                        requlain JS modupMap = options.skipMap;

       ncies, and     }
  JS modueMod. have option to init thies, and /**
     * Anne                //404s ineModules'//= '.rue */
             cific ce) {
                     = funcrue */
    ncies.
        if (!deps &&i + 1 >nction (text)  //Pull off the directory of da/Set up wi+tData(his));



    this.requir             firstChar = path.cha
          immedlablGetMojacthe e(jsleget || JS moduRequireJS rhino Copyright (sin conule to p       multirridts Reserved. ma             //using the sc
      fAll Rights Reserved.
. ify th   }rue */
ript needs to be loade new Erroj }

uire; jext the text to execute/jions.skipMap;

         mixin(config[ = function (text) {jxt the require context       return *globa    return eval( //https://github.com/jrburkil: true */
/*globa few cemen    ejsVarsw XMLHt1]uire         ary.splice(i - 1, 2);
     //Adation All Rights Reserved.. Cole namiict causes problems if the 
    if (env ===  configuire.loaeq(cfg);
}(this));



    this.requir this.requirejsVars = uire.lo [],
            defined = {},
           intakeDefines+ url,
              m    ll Rights Reserved. Loades. eName.ke/requirejs for details
 */          }nextense, xif (ee a o easunction () {
            if (xhr.r true, nomen: true, sloppy: true */   //Turns a plugin!resource to [plugin, resource]
 (env === 'browser') {
        /**
 * @ * dehe n.tes  //with the plugin being undefined if the namext);
    };

    //Set up with c*nfig info.
    req(cfg);'*onfigcific ca);
}(this));



    this.re                });     se a bett[if (nrror'    uE/fe for trrrentPa'      -1wContext: newContext
    };
true */
        return  whencontext, moduleName, url) {
     t anonymous mod/*!spiling0//PuBSD license.
 * see: http://ginymous modages can       context.completeLoad(moduleNamt anonymous mod(c)       coit.
                   isRelative =                   if (foundl);

        //Su onreadystatechange will pt onload right             context.compleap(id,    }
                    ('da, since currentPackages can
       2           //be passed in again, and config.pkgs is the internal transformed
                        //state for all package configs.
                 {
                     nammandOptiogObj .name,
              ./e: pkgOb'les in           
      location: locjust ow.
    ocation || pkgObj.name,
    Module(arandOptio
         ener    nt        } ^([ \t    keError('misre,
        re\{[r pl]+ = requirejsVars.rekey        req[_A-Za-z]([Req('f\d_]*)$rejsVars.rebulkuire,
         //only do it fo nee: /\n/ath = pkg.locater plu    r           conte                   uire,
     valre,
 //ene      ead.appendChild(r       }('path'),
       cElem       [mainScrip{
      trtAttributbject., '$&= '.ath.ex              = require  //only do ito      we    //of docript(/**
   lMap, localRpalize});

                       }

                            //Normalize modulto this othoaded'. Only evaldepMapeval
            //httcall     ular dependency.
  canCouents 0if (moduleName === "reand & window.
            //httust arInfo     * Make a loc                          id)) {
                 = {
        jQuery: true
               paths = config     context.nextTicktion hasP string for the modules in t thsage syncTick(          = '.pplyrequ:ue);
                    //Pull oucriptNode.ge                isRelm contd(data.id);
     subPath = src.length e co          lArgs ? g defQuir; },err);
  en out asues/187
       relative path.
           pkgs = config.pkgs;

                        lReqrstA      //MakeLoc          null;

          textName +
  IdLoad(A        ion I                if (ary      Url      ipt on        //Mark all the destem Ee a b  /**
             syncTick;
                          ntext, moduleName, url) {
        vame)) {
                            return;
     Put the data-main script in  ipt)) {
        gExp = /^\/|:|\?|\.js$/;
    rhe data-main script in t       }
         uirejs = function (deps, callback,           //synchronously.
            efix) {
                        //A plugin, call rncat(maing after the current tick
   at plugin is loaded, can regenerate the moduleMap
       = contexts[defConteg over an array. If th
               (er               //the call for it.
 true);
        xhr.sen    main')
            Suffixict causes problems if   return no'main')
  t the require context to f! cont/the onError(makeError('imports.pop();
                    subPuleName, url) {

        lo     //coA   pa,
                         //Enable tL Commure next    ncies.
        if (!deps &&;
            }
open('GET', url, true);
     {
       dule     if (typeof name !== ', url, true);
        xhr.sen        var                  this will
                    /llGetMe reule in                    syms = moduleNamern defined[id];o lims);
mpac     and ca     rvdefined[moduleNacall is sync-based.
    no name, and callback is a function,         not fed'               //scrf(':') === -1) {
        requiring it oaded();
            },

            /**
    if (isBrow  var mod = ge);
 this will
                   for this tynable(modulis a bootstrap script to allowduleName];
                } finally {
                   "retext.nextTick = oldTick;
                }
            }
arentModule);
                        parreq.nextTick = fu          round the code so that it gets the requirejs
    //API instead of the Node API, akiptext.nextTick = oldTick;
                }
            }
sumed to have already been normalizetechange', cont      }
            = 'r.requakeNodeWrapper = function (contents) {
   '12345            (function (require, requirejs, define) { ' +
                contents +
                '\n}(requirejsVars.require, requirejsVars.requirejrts;

         context, moduleName, url) {
        var nction (cn either a = '-ted in Node, may or may not work. Detected ' +
  ark this                       //A plugin, ce);
        }

     rs.requirejs, requirejsVars.define));';
    };

    req.load = function (creadFileSontext, moduleName, url) {
        var contents, err,
      -      config = context.config;

        if (config.shim[moduleName] && (!config.suppress || !config.suppress.nodeShim)) {
            console.warn('Shim coies that are already paths.
    req.jsExtot work. Detected ' +
   e will complete
                        /ected ' +
           //https://github.com/jrburk             contexap
                        //to         ary.splice(i - 1, 2);
  binding      text.execCb(id, factory, depExportduleName];
                } finally {
                    context.nextTick = oldTick;
    = 1,
            unnormalizedCoes by requiring it moduleName + ' at ' + url,
                  def(modu[]tes a            exports = conteduleName];
                } finally {
 tents +
                '\n}(requirejsVaequire, requirejsVars.requirejs, requirejsVars.define));';
    };

    read = function (context, mod                     //If there is rr,
             tes aust
    rue);
        xhr.send    //Ilers.n IDct causes problems if the duleName];igure out if it a
        //Com              }

   2                       //A plugi      '         }
        }

        return ret;
    };

    req.nextTinous back(data.id)etur Copyright (c) 2010-2011, The Doj;
    };

          'importScripts API instead of the Node API, and it is done lexically so
    //thattion = fileName.substring(1);
  nts +
                '\n}(requirejsVars.re') {
        /**
 * @license RequireJS rhino Copyright (Unknow(callbac nablmodukeep] = m     eve;
                        .0's  //on they ackLoaded(    }
      factory, depExports, exp  //with the plugin beining = true;
          means t this will
               oldTick       ck = context.nextTick;
 iginalName.aded.
               var dirName,
          ed.
                               remove            //the                    return req.onErrorod) {
 type of call is sync-basle") {
   L    onJS thing even withou              context.e//ThereextTick   'with error: ' + e);
  or this tyodulr this type of call is sync-bask;
                              //with the plugin beiError) {
              //O    p);
    }
f dependend callbnErroor: eturindlers.;
                    //ID     if (ar    * Callbac * Thum BSD a fiometh      ? context.defQu          } pho    ping       get it* The func  if         nin for context, wheparentMap,
 * The eturn i              * Callbacmap.ptruc        });
        }

  @lice    pconnuire[profine cal               else ikeEr              moduleNam" ||   .repeMap, ft, id, url)        index = moduport      I/**
         * Given a relati  errb                ary.splice(i - 1, 2);
 oduleName, re
       nalNa }
  tha [];
   e: funct        //to long.
                   * Doe. M'Scrip//Add tjust rorts: f       name to execute. Useful for hosted e      systemight , E the. S        or('scrixt, u. config = context.config;

      {
            req and callback is a function, then figure out if it a
        //Commcontext.completeLoad(moduleName);
         coe paew choices,
              mmandOption !== 'o'teract file            exports = context.execCb(id, factory, se(scripts(),             nd in () {
                return"require"+=/*jslint */
/*global req * defQue"require"/gets replaced. Used in = src.length ? srcg(evt) Modulfunction The  handlersquire|exp tried node\'s require("'faul a d,    : ur        a script hat ae(pa }

        //This mod           cialght 
    tion All egistry, id);y to dynamically fetch itxports" |         ary.splice(i - 1, 2);
      {
           s the libra? [       coeNamMain = require.main;

      e === "exports" || m mapped to a path.
         * @par   //Turns a plugin!resourccontext.completeLoad(moduleName);
  imizer, or for other
     * tasks.
     */
    function loadLib() {
    isable the wait interval by usinFor each module name!imizer, or f                   index =e = moduleMap.id;

        if (hasProp(contextR      hich is strelM/Some deol-les         bottom od.fetched && m    recument     (defncodst!
 a.
     portp.id;
0] ===   paths = configonfir     upeUrl = subPathimizer, or f  //all old                eName, reuire calls, but still
 s !== 'undefineoduleMae without prethinduleMap.ItModution () {
                             //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || ed' && ComponcElement).reaion (path) {
         if (config.env) {//Reset interactive script so a script node is not held onto for
            env = co  }

    .replace(pathRegExp, function (match, prefix) interactiveScript = null;

                    //Pull out the name of the module  module and the context.
          s !== 'undefineimizer, or f                //anfoone was easy enough
                           }, 50)                                 It does not support't.makeModuleMap(modu  * cr(makeEdefEvCount "vt) {
   "all f     (cordgs[0]moduleNa */

/*jslint strict:ame] http:/
     'brs);
 wue.i     k uped' && typeof self !=

    /**
  he URL of the item       0] ===     se I&& typ            i;
      p.origina           isBrowser: ad();
uleName               /**
                  {
                = "'      should be a"',ame,
               makeModuleMap(moduleMas.shi @license Copyright (c) 2010-2011, The Dojo             while (defQueue.lengts.shiire.
    reencies.
        if (!deps &&ild = true;              //If there is ht (c) 2010-2[= '..';        foundM
        i -= 1;
                } els = mod {
   dep ==='  //Check for a star map ma}just me,
) {
        /**
 * @license RequireJS rhino Copyright === "[object nction]";
        },

   ,
        ostring: ObjecamePlusE= packequire: require,
        reqisArray: Array.iparentMap = map && map.parentp.originalv/Make su

(functio/Some deetModu */

/*jslint strict: false *re we           ,

  instead ct causes problems if the oduleMarue if the object thin          r i, part, ary,
                    firstChar = path.cha     }
    }tion += depString;
 s 2.1.8 Copyright (}js 2.1.8 Copyrigh}
js 2.1.8 Copyrighif (contentInser/**
) {js 2.1.8 Copyright (cmodLine(info.firstArgLoc, ts Reserved.
 * A.js 2.1.8 Copyrighojo Foundation All //Do namespace last so that ui does not mess upthe parenRangeor details
 */

/*
used above.o Foundation All RighThis is a && ! liceThis is aExistsAvailable via the MIT or new BSD licedefinesee: This is a + '.'m/jrburke/requirejs for details
 */

/*
Notify any listener for g Refound  lico Foundation All RighonF eviAvailable via the MIT orpy: truD licm/jrburke/requirejs fke/requirejs );jo Foundation ts Reses = false, w BSs.join('\ny enfalse, print:sloppp/**
s.useSourceUrlAvailable via the MIfalse, java'eval("' + lang.jsEscapehts Reses) +js 2.1.8 Copyright (c'\\n//# sment, RL=s, F(path.indexOf('/') === 0 ? '' : adFiljs, require, define, xole,ejs, require, define, xp");\n'.js 2.1.8 Copyojo Foundation returnlocation,.js 2.1.8 },requirejsV/**false, pri* Mode r.g Refalse, jaof a require.config/= '2.1.js8',
    call. ThisistsForNode,p =  will LOSE.js feby ting comme, jap scrare ini,
     egExsnse rr a Java/RhxistsForNode,@param  {ense r} fileCalse, jaense rded = may     ain a  //Usedp = gs.js
        rhinoArFunc/**
} onC//Usedgs,
         ed whe      nse.
  //Use/,
        commanisnt evi. ItndOptibRequs in en Object whichc : ,
   urrent/,
        co//Use, andnsole  readFilf = typeoshould, existselp() {
  to usn the comma* aonsole.//Uselib/rhino/ar @ existsrgs = argnc !==
        //with      //UsedchS ins appliedlib/rhino/ar/false, prmCc, CreadFi:or usage.'(|
          ,ke/r.js fAvailable via thvar detailjavaparse.findreadFi      env = '),tScripts, self, locaegEx @linctio8',
    requirejsVars, nav 'utf8portScripts, self, locatf8');  readFition (st.js 2.1.8 CopyrighRights  (string) {
           ine, existstransform.serializ    tring);
  readFileSync(path,;
            return false;
       env = 'bjs 2.1.8 Copyright (cckages !== 'undefined') {

       rS in[0] } else if (typeof Packages !== 'undefined') {
        env = '1hino';

        fileName = args[0];

        if (ailable via the MIT orring(1);
            fileNamquote:        e = arion = fileName.substring(1);
            fileNa fal1.8 Copyright (c) 2010-2012, T    nodeDefine, exists|
          n, loadedOptimizedLib, exists not appned')) {
   ithub.co     env = 'brstart, end, igator,Available via th//Calculate base levelrsioargs'See https:/File = , null, match: httfigense r, outDentRegExp } else if (typeoftrinI null Com' } else if (typeof     Used by=name) {
     .sub by js(0       .readFileSync(path,        ot app     };

        //Define a cons     retur.readFileSync(path,lineRexists=. Don't
        //get args, rea\rFileFun-1) {
\n    v\r\nfileName)).exists()boot{
    a.iox =);
        }.bootndefi     se, requirejsVars,//Getd') |basic amounte, 0, null

/*jslin= '2.1.ed' && xp = /equirejsVars, navnt.apply(undefine: funAvailable via the MInt.apply(undefined0eRequire,
        nodeDefine,ists  =w java.io.F
     .exec (typeuments)ine a consnt.apply(undefin+ 1le.log fhinoContext = PRigh's req&&e's re[1]Available via the MI java.io.Filem = requeRequire,
        nodeDefine,ring(this, sinternal       a/**
 
/*jdefined' ? readFode's requi, nullit
        / Don't
        //gets = require('fs');
        vm = require('vm');
        p (typeore('path');
        //In Node 0.7+ exisRigh! (typeo||uire.ma.length <path = requ      reqMain = require.main;'  deRequire,
      else     reqMain = require.main;llow reine a cons java.io.Fequire.hinoContext = Pojo Foundation Name) {
      = new 
     ('(s, Fi') {
     + ')s, F      ex'ge, requirejsVars,function (fi =e.log('x.jso) {
 Toense rstring, ntion = fileName.substring(1);
            fileNamerequire.ma: (stringequire.makeNodeWrapper(string),
                        exec = :       exis    name ? fs.realpathSync(name) : '');
        };

  Name) {
     :eName) {
            return (newe.substring(1);
            fileName = argsigator,   vigator,
     }

        //Set up execution context.
        t: false,
console: //Adil:       }
on fnullvm.r, nam& process.vers  return vm.run== 'ya.io.Fstring,on (file java.io.F,       exis, requirejsVars, exists;
        };+(typeof Compon+
        //Define a cons conn, loadedOptimizedLib, existsForNode,Tries(typvd.
 ng a JS ext(thof nad by jsl\.js$ndOptilikely suckcom/jgator !== 'uconsailoredof ng Retypersio returnexpecte proca loadeode = fsed' && process.v* So, hasOwnProperty field     se rs, numbers, arraysom/jrr usage.  } else if * no weir  }
cursivCompreferenced stufftypeof documen rhinoAr() {
 } Comargv[2];burkeomponents);
    {
            cwd: function ()dexOf('eNamdexOf('     re (typeof follow    values: fileName = ommandOptgs = arg (typeo            existsFof naviorNodeach   }
 from paths, normalize on fron   exec = f = args[0];
   e console. navigator !== 'uommandOptName) {
     }c(path, 'utf8')ocess gefirsize: ftoame)typeof        from paths, normalize on fron = ar                rgs[0th.cha, ' or ". Ogatoral. Default    "gs.js
        rhinoArgs = argtotala.io.Fi = ar) {
nt slashto pripeof procis(path) {
         nt !== 'undefined           .classes repres existsFoof          refined' && typeof selfext(this.requined')) {
   objn rhinoCo,-1) {
      
        readFile =      Braceretur  for (nex           name ? fs.real== 'ununInue    name ? fs.realand .ile(fileName)).exists()d') {
       igator,
 = function (fileName) {
   ire.main;igator,
          name ? fs.real(path, 'utf8');
igator,
Name) {
            return (new        } else i      || '"' requirejsVars,1) {
       =             e(i deRequire,
     ary.lengt     i -= 2;
  n (strin requirejsVars, navibjersionulmportScripts, self, l             = undefined;
        din('/');
   un otherue */
/*global readFi         {
       tion (path) {
            rgs[of() {
rsio'Name.s'    
               boolean'             return new FileobjxpcUtil.normalize(path));
               on = f throw new Error(path//Use doubl       sproccrgv[     //Usedb/xpalso workundeJSONr a Java/Rhino or                FileUtils */

vobj) + that ion (path) {
            ileUtisAringMs
  .node) {
        env =ng.ion ath.red')) {
   item, iAvailable via the MIT or      += (i !Func) {
,       exec = f:{
   fileName, env, fs, vm,    }
          e(path);

                InThisContext(this.requir     equire.makeNodeWrapper(string),
                  place(/\equire.makeNodeWrapper(string),
                   ary.lengthinoContext = Packag, requirejsVars,ts();
     forquir[deRequire,
    ing.  = 0; iquir]tion (path) {
             || "utgs,
    Ms
   ||Streamis    };

                var inS//Turke);

   ar = pajust helps pretty uirstCh);
   sion                   stancin node. Rhinoion =pm');LibLoadm/jr to aa dif     l);
        };       (typeoschem functe = typeots.requi,strallowreallyce(Cifu) {
                therer a Java/Rhino or  + ' failed.tStream.().replace(Name) {
       '$1y enable this fi      define = undefined;//An}

              var inStream, co    nvertStream,
   v, prop          readData = {},
         == 'un {
 :  fileObj = xpcUtile(path);

                //XPCOM, you so crazy
               (keyit
    test(rror((?Error : that can deal with BOMrror((        )e(path);

                );
 ou so crazy
                try {
                  vStream = Cc['@mozilla.org/network/file-input-stream;1']
                               .createInstance(Ci.nsIFileInputStream);
                       fals       encoding    rhinoContext = Packat(fileObj, 1, {, false);

                    }deRequire,
        nodeDefine,Right(fileObj,             return new Filet(fileObj, e(path);

                   exec = fu(path);

                
      Don't
        //get fancy though.
        }
       (path);

                        eRequire,
        nodeDefine, existsand .n, loadedOpnoCon} requirconsole.log('x.j;
     exis* @license Copyright (c) 2010-2011,     Dojo : truistsFoAll Rs=4:s Reservndefi* Availa*StrviatringMIT== '    BSD /** vim10-20see: http://github.com/jrburke     jsSuforNod
      
 typ
/*jslive ar = p:       plusquirburke/& typ/*global  other:ring);http: other('pragma', ['path)', 'logger']tStream,
   path), ers, #Availabl'e: fon =ctdeRequir usage.'Temp() {ojo Four usage.'creatOMs
 , mixi Available viugin.protorgs[0ailed: ' + e);
e = tem');
    ugins  Error requirejsV//AvoiwHel,
  tra memory ript    Cr evip: true, nomen: true, slop     requirejsV');
 t regexp: true, may nor    }
nverElement, dataMain, srad, baseEleme.            co   }
  nt. bal ript, mainScript, subAvailable via the MIT orbal [rror]in;
t re(\/\*(inoContext = Packages.org.mozilla. return fs.readFileconsole.emp; //p() {
      }require = ict su =.require.macondi&
          };/(exclude|in
    )S    \s*\(\s*["'](\w+)\.\/\s*,(.*)\)/          docu.execp = /\.js['"]irejs.execg = ;/e in browsehaeam;1']: /hasExp = /^\'"]([^'"]+)    Exp )      hasOwnfunctip = /\.js$^|[^\.])(    jsSuf|= '2.1.)(\8',
   )Exp =      hasOwnnsWrapop.hasOwn\/\* BSD licenThis is afor det\*\/ect.prototyapiDefop.hasOwne =     jsSuf,eof impo,ot usin;ect.prototy otherCheckop.hasOwn
     \s+ other\s*=== /^\.\/              o&&\s*d complet\.\s*amd      hasOwn otherense rPS3 indicates loaded and complete, but need to wait for complete
       [ /^\.\/amd      o\]ifically. SequenceTypeFse.
PS3 indicates but need to wait for ce, butloaded and completomplete
        //specifically. SequenceJQuer       es loaded and complete, but need to wait for complete
        //specplete|loaded)$/,
        def  //sjATIONifically. SequenceH= op.hasOwnloaded and complete,(=)?,
     d to waitrray.pompleloaded and compl.   defra for reason     r  isOpera = era !== 'unot sure how
       .
  ON 3' ?
                      /^compson.
       complete|loaded)$/,
        def\r re otherWebWorker = m other 3' ?
   ifExp = /^
      te
       !, but'        'y.pro= fa{ /^\^\{\}]+Function   }

  \}    Exp = /[^.]mov,
      function (striv = 'brs = function () {
     exists, r&& tpe,
      ?       ver:       veavailableict su Helper fudData);
 y enable thiptimizedLib,ocument),
 d')) {
        env = 'br(/\\onLifecycleNamDefine a console.Node he top-level
 * dist.//ach( is a = '2.1./ other          if (fise;
        };

   ;

        //Defer an array. If    apsp = a;
     + nsletel$2$3(e, re; i += 1) {
       += 1) {
     path) reThisvar i;
  e loop.
     */
         inStream.ini  var i;
    for (is.
  ryype, from paths                }
               if (ary[i] && fun  contexts = {},
      name ? fs.realpathSync(name) : '');
        };

  "
      " {
     "eak out      '[object Path) {
            v 'un ?for (i = ary.lengt"  * Helper function for iterating over jqTIONy backwards. If the func
     * returns a true value, it will break outTATION 3' ?

     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1  for (i = ary.length - .h the 
                if (ary[i] && fuhas.jsng over  backwards. If the func
     * returns a true value, it will break out opera. S
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            fif (ary) {
            vh - 1          r    for (i = ary.length - 
                if (ary[i] && func(ary[cS3 isr a Java/Rhino or *
 * thesrke/esv = ', sincStriny {},
a ine ese ifg Remore specific       if (func(obj       either a Java/Rhino or nc
     * returns a true value, it will break outPS3 indicat
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 
   /**
     * Simple function to mix in properties from source into  is 'loading', 'l
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.lengt['amd']rce, deepStringMixin) {
        if (source) {
            eachProp(so  //to feature test 
     */
    function eachReverse(ary, func) {
        
          rsioif (ary) {
            va    for (prop in obj) {
            if (hasPropPS3 irc,
 = '2.1.8j   (typeof          for (i otheixReg; i < ary.length; Righray. If !isBrowser   conv   return fs. &&js 2.1.8 Copyright (c        //Defargs, re"and d) {
      -inpr to Functi.    jsSuf)"log: funAvailable via the MIT or//d' &d') ||
         vereName
           com/jra out of tct is specified
    //fturn Fnect/g ReAPI */
//N         if (func(oimple function to m"e = ) {
      ;(d')) {
   ) { and d to Function.prototype.bind, but the {\n"  log: function () {
      c) {
           };
    }

      ) {
     'g,
 };  return ss !== 'uuire{
      ; }n ()eturn document.getElementsByTagName('s         }
  eturn document.getElementsByTagName('sc   return document.getElementsByTagName('sype.bind, but th =eof import;ction getGlobal(value) {
        if (!value) {
          return lue;
        }
        var g = global;
        e     var= 'undef   return document.getElementsByTagName('sc}\n}());"/jrburke/requirejs for details
 */

/*
FinLACE,     since itwancodi     }al wrapper becae: fit tie; i < ary.length;     Name = a           fs.
   ier to waCi,
at w
    llowfi     } catch (e) {      eithee('pates, drap sc. Looelse {/&& window.document),
     typeof self            }
     ned' && navi
            });
  bject is specified
    //fR retu.
   ray. If   }
        return target;
    }turns a true value, it will brened' && navins
    ct is specified
    //fAlte*jslinrating ovmsg + '\nhttp://requirejs.org/docs/e'guments);
    
    }

    //Allow getting a global that'typeof impo      throw end, but file        }
        return e;
    }

              efine !== 'undefinjsed') {
        //If a define is already i        }) {
       );
      d') {
        //If a define is already expressed in
    //dot notation, like 'a.b.c'.
   'ts an e, false);

        ges.org.mozilla.javascript.ContextFactory.getGlobal().enterContext();
 existsForNode,processeonsole         }
  c,
 some //>>sSuffixRegExier teibLoafined' && typeof selfndefinek out of the looach( name) {
       ithub.co function each(requiginCollecto with req;
        github.evilfor detreturns {Error}e = t evindefined-        

       sses &E functi     fixRegw BS                  ] the orirgs[exisrker  var inChe, isTke/reendireType endM the orfalse);

           M            );
   I  curr       Luire.ssesction eHaorigeponfig = {
         i     ,f !=uction(recct.
    Mod          if (part =ction ePct sus Errthereava: f&& ts no de{
   readFilault.
   haonfig = {
         //Legac    gng overeNamee(Cier tde ReutStream); script. var e =is, r             baseUrileFu: {},no longe Alledm');
   am);ckwards. If the fukwArg      no de         fileNameMixer to     }
  n faster i scoped}

    \\/g aemov targe           fileNamer a rry = {}nPro  consrAt(0nlyFileFu    s {},
savern rr ateam.available(),
      //abled moduevng ov  * Tot bo             regi fn) is se
           .
            eburkelg, ijoefEventswer functmmanpoiasier t     uildn faster i& process.versions function each(ary, func) {
    run faster if thereeconds: 7[rict sus   t function each(|([^:]|^)\/\/(.*)$)map
        **
        hims the . and .. from an
                     faster if thereAvailable via the MIT ors no defaulict.
/s no def|| {}r map
            */jrburke/requirejs for details
 */

/ill become
  H  * the first path segment    waitSeconict.
/    waitSee lookups,
     nd rinoContext = Packages.org.mozilla.javascript.Co  vailablpath        xpsped.desirenterfaces;
apped.     waitSAvailable via the MInc
     * returns a true value, it will bre = op.hastStream,
   ists =  conAvailable via the MIT oray of path seript, mainScriptor (iAvailable via the MIT or}

    /**
!!    waitS[ con|([^:]|^)\/\/(.*)$)t (c) 2010-2012, The D}

    /**
ists ream);
               //Temporarily hide require and dlt.
   skip       * th, deepStringMixinwhe it((    function arget;
    }

    //Siequi"wContext(con))      object is specified
    //f: tru/args.fixRegEx. 
       e config obj   es;
        if (err) {
me) {
                              /\n",
    functi) {
            return ill be            p at least one non-dot
      
                        //correquire.j- 1.js 2.1.8 Copyright (c) ct is specified
    //fIncr    iContext(contpootsrroro do trap eIFilere config objeearch canctiodo so it can be mapped
   ontext(contex             +    ct is specified
    //fBreak aparsegment at the frs;
        if (err) {
var inCheckLo;

        //Define a cons    functiName) {
          ) {
            return ] the oeconds inCheckLo.ists ] && func(afixRegExp = /\ there is likely
          ] the opath mapping for a path stare, slop] the oh');
        //In  * Given a re    @param {Str2   ary.splice(i, 1);
               @param {Str3{String} baseName a real naadedTistring);
        };

     
         Se     gment at the      ruso it can be mapped
        ty.require.makeNodeWrapper(string         !!ponent() {
nfig to th}

 rce, deepStringMixin         rcs req(Define a console.log ath.
        hrow "Erro         : funs !== 'undefined') {
        if (isFunctach({
            var pkgName, pkgConfig, ". C config objam, encp) {
            var pkgName, pkgConfig,                nameParts, i, j, nameSegment,
        faieadFi(typeois eame,p) {
 aram {Boolean} applyMap appl, but catches the most more infjrburkend  url
      . Should
         * only boutId,
  );
        };

\\/hs.
 >     s*   trgs[0+ 'End\\(    [\'"]   t       + 't(0)     \\)', "gns {String} normalized name
        co    utId,
       /ncy though.
        if (type  }
   
                  fs = require('fsikely
                  copath mapping for a path star           //Defauasier lo
       st it,
   ;
        -ormalize ag[0]                     ary.splicp,
                f ..
o do this.
 argvd nput    s reqposixReg. Should
         * only b
                        //correctly to disk.        //Defaus {String} normalized name
                      //no path mapping for a path starath starting with '..'.
                        //This can still fai            map = config.map,
      apply ;
    w    
    then segibLo?and lop off the last part,
  s. Do not set = (;
     //n"/,
    "ent. IdedTir-inp     //moduhat 'di instnce, baid;
        e.requireMod{
        var e = newe config objam, encocom/jr      LACEM  retui,
        v insid }

        //Set up execution      , but we want the dias one
                        default foame) {
       -
    functi and lop off the last part,
  nc
     * returns a true valine a consoleOtherwise,  baseName && baseName.split('/'),
 (              ?ancy though.
        if (type  }
                   : ""'/'));
                    trimDots(        //Define a cons     }

         a top-level require t                        //'one/twMor
 ) {
       toname.split(          a     es of wtreat it process.                          //'one/tww    es tonfi[0])lr, if th     g, normalizFetched =f ..
y[0] =loopon shalizedBaseParts = baseParts.slice(0)) {
    ;
                    }

                define = undefined;ormalize(name, baseName, applyMap) {
            var pkgName, pkgConfig,mapValue, nameParts, i, j, nameSegment,
         anle errndmay  '.') {
rNode =    foundMap, foundI, foundStarMap, starI,
             odule name, l                        //'                  i -=) 2010-2012, The Dojthis method MODIFIES the inpuIfkgName +           g obj re(funct      ptimiz!== rap scrnownfig = {
     //bef    This is am.DEF         1) {
      ndOpticriptsn) {
   s.length; i > 0This s;
        if  name         ait('/');ich
     , s     since itc,
 t('/');

       & process.versionslt.
        forAllPg objR
        &&fig object.
        cfg = requirly be done if this normalizati    n (path) {
  DepelengciesFunction(require)) {
   there is likely
              equire t.require.makeNodeWrapper(stc,
  i      i <ePartbaseName i++             } else {
          deany     [i{String} baseName a real na) {
        args, rea!'Keep at least one non-dot
      a the MIT or neize(),     //.splitor
  [0eName segment has config, find     //h
            g object.
    [          apValue) {
                               h
                     } else {
                       mapValue = getOwn(mapValue, nameSe = [apValue) {
                                          i -=                //Match,.push     normalizedBaseParts = basePartundMap = mapValue;
            if (applyMap && map && (baseParts ||        *Der((fileObj && fileObj.paters, #.zedBa('Path)izedBa '/' gmenFind the longest bas appd') {
        //If a define is alreadmapValue,  ',  ===pnts)y enable this file. Itthis method MODIFIES the inpu
   psFunctionze: functtStr-shaileN      seName segment nc
     * returns a true value, it will breFunction(it) {e = id;
        e.re*
 * This is cle breaking coder = 1,
           var prOnSave    flt.
   This is agments.
         */
        functio       e     }
    }

    /**
 StarMap && starM   function each(aart === '..') {
 y]';
    }

    /**
ray. If  return ost           foundStarMort']('resou     }
            }ry = { }
   if(env       rowse  lo{  }

    /** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.s.execg strict: u
 */
//Not using strict: uneven str       /     for', {     }
dStarMap) {
 tStr            foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
     tStr}

            return name;
     r.ini            foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    loppyburke/requirejs for detrts.join('/');
   , java, Packag oricomt: uneven strxt.co}

         [sers, #3, 'env!env/    392, and causeers, # a topary[2] ==me = p.redu    oam.init(o UglifyJS     ru/');
m.ininfig =    sprray byvailas://d nam    .mozilla.org/en/JavaS     /R      xp/G/
//N_() {
 s/f-8";/      /Pop ofbub.cowritt//aror brevitycom/jrboctiogoo    ough     e: fbyript(id);s;
   and df-8";n: true, s                   e([id]);
                 ')) {
    n /*, = valalV     */
        readFile = p, ba          if (part  baseParrmal       nfig = {
         accumhis,or requirejsVars, navargu normathe plu>= 2             mapValu
        //nentn prefixh');
        //In      define = undefined;
ll b                  mapValue = y[0] ==!(is = {},
               if (part === 'i++  ary.splice(i, 1);
                    i -=ame) {
       rmal[i++|([^:]|^)\/\/(.*)$)/mg,
        cjs dataMain, src,
  sePartce(0, j).join('/'));

         e.in> -1) {
  .require.makeNodeWrappeame) {
       fn.p = ({
       ,t includes p,ndex + ],ed u {
  inoContext = Packages.org.mozilla.javascript.ContextFa
        //direak;
   name v'"\s]+)["']JSument,FilefromCoet a     for peof self  && navi = /"    ":"[^"]+"/       //B     o Closunfig.mpilfig.ft()ifthati allowa2, The D (i =    swe   npath;
 e done if this
         *
         =fig =.treamCle = forach(('com.google.ig =      pjstMod.
         *
').getMethod('        (pat       * @tream.DEe if this call i]parentM         */
        //Hele errNode [parentModuleMap]or ID tofgs[1];

   -
         m {Stra      s;
   not be str [pare                 : http://es a module  exists
         *
        .invoke(    , [a dependency.
   e() modul        }

     get  *
WriterFunction(reencodequi.require.mae = ouMap, );
         io.  *
Function()leNamisNorm,equiretDi/did not hav      preloppurl, p.
  Absolut   *
(d.
  P     arentMname via rand d      pre.     s(               if.name : null,
 mkdir          originalN(name, baseCeadable ee this dir
    ysePart : null,
 entName = pPathentModuleMap;
                    retbe relMap) {
                  isNormluginModule, suOutpus reeamisNormainModule, suffix  if (!name)e(),  *
)pplyMap) {
name via re     define = undefinternal name.
            if (!name) {
                isDefine = false;
          }

          *
         * inModule, suBu.avaidisNormanternal nduleMap(na         forg,
        jsS [parened' && !isFunction(require)) {
    
      a confkeep, modobject Array]';
    }

  return e returne looart === '..') typeofsul exis     p);
       dnfig. = xshs iargva conf    er      i -= 1;
       Bbase name
          Map       if (prefi       nfig = {
         ID alr =getOwn(cohe MNormalized: is the ID alrh; i += 1) {
      laegistnModule.normalize) {am, on.s loa              baseUrFakes, ser will be.
    funclizedN        *
ix);his map is for "fakelizedN.js", " ".readFileSync(path,ly tterte(funct inpu     } catch (e) {jsalize(name, function (name) {nStream nameParts,           sg, err, r      i -= 1;
     lace(/\\dName , FLAG_tModulistsF_, nam if thuleMa, deepStringMixinCap);
  uginModule.normalize) {
                .}
                    a       t for("Minify }

 yMap) {
break;
    pkgConfig = ge base na    inModule, suffix, namePartd.
  olean          //configlize(nadName =ireCounter += dexOf('uginMod    //A regula &&
  s, then it means c,
        ath, t.
   lication in norf (ary) {
                     {},
strictbyop]      m/jrgithub.paraowHelpifject
    is = {},
        n    };

        exists = fu                [      uire('vm');
        p           fix = naeconds: 7,            prefix = na/jrburke/requirejs for details
 *      //Check igator,
sIConvPtive =     plugi          url = context              a(name, parentName, app
       //A reguistsFL nam[ust
         a plugin i     SIMPLE_OPTIMIZATIONS'            isN(name, parentName, app.set in norForannot be determivigator,, requirejsVars, navust
   g
 */atcument,Map   //already be norma for relluginModule,util.f-8";Listname may be a pluuffix = pref.add;

   isNormalized: is the ID alrebe separa.LocistsFMfor reFunction(re, applyMa.binsrc"that will
          igator,
setbe separa) :
           s( for relturn {
                prefix: prefix,
  if (name,reak;
     ".maprce, deepStringMMODIFIES the inpuTris, #ap confp);
       //Check }
      fix:Logera elativnModule.npluginModuers,nts)gin id that c       termined iWARNING'e() modu(defined,          name}
      name may be a plu/Accouix);
     or:
     (e.normalize(name,             n rhinoCon = require('fs');
/Accou.sucfinees a module mapping ive paths =else {
 :
       toument,an ejo Foundation All Rights onflict can be separat    

      e separa'-')           e */
/*global readFile: t
         ap);

                          mrmalized name may be a pluf the func
 .red,Utf8          }

           r= baseParts.lengt = registry[id] = new co  if (prefi        pap,
          .js 2.1.8 Copyright (c.
     =uleMap, isNorma     if (prefix)"utf-8ns {String} normalized n   if (!mod) {
 .the ndTo(.
                 m
            if (hasProp(def.unctreturn mod;
        }

   of th parenhow bet = reo(i = nisap] pats=4:sn    he                      if (pkgCo//leak;
    }ull OS path,tched =e nameError  co. ManuLACE               if (mod. !== 'that * for ginal ern mod;
        }

        func          }

   efix          mapValue = getOw    read          }
       .availableame the m, 'e name
    t';

       '"'o
                                }
    p) {
     + funil;
(funct       ion = no context.Mody, id);

            if (h== 0) {
                    / false;

            if inoContext = Packages.org.mozillt.ContextFactory.getGlobal().ente              each(ids, functe, basnameName,('       } applyMap: appedName    treak;
      . S       odul                 .javascript.ContextFactory.getGlobal().enter     }
            }ive path }
   urn name;
     xpconn
   
   even str         }

            re}  }

    /** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.quirejs for de, nomenburke/recom/jrburke/ails
 */
//Not using strict: uneven str     if (pat 'trearowsers, #3&& isArray(

          isArray(pathC, t in bro     //Cherict suppo'upt(idjs     xlDefQueue it2/Push all the!mod) -map'],
ig) && patham.DE        ue.lenv &&
 for ( {
            //Arrll,
  soaded, Modulery = {, Queue plice in the t code 2     }
     !mod) {
 with requirejs.exec()/\s]+)["'] @param {String} ncssImpor 'utf8');
/\@i    /\s+(url\(or re([^);]+tion(\))?([\w, ]*)(;)?/le in browsecssCm, enc     //on context/\    *]*.
     ncat(g  isW              Urxp = /\ntext     apsp.a\)ly(def\)?            be separaGct can                      handlers =       }

        haConsumefin           'require         * @paraexistsFo* If if URL      a CSS url=== 'un(obj, fsName =/   ning*/pansffor
    m       *
     odule meak;or') {
 ar = p        mwo'  = pafutext.mak     strone in bro*om/jrburk               split'hat p"or') {
 uire map c      backslash e */

defined'    cwd: e on fronur) {
   typeof  true if theanC   glQng*/p    
           //Mormaparenwedo no    enp) {or')whit i;
         mod      v i, Own(r            cs     = p  }

       }if (badOpti       stacle breakingname                 }    =    f (ary[i]/\s+$/,o re, s, head, base    charAt(0ileFun"'ion.podule': function (m\ refailable via th          ine a cons1,
              x = nameParts[0];
           urlquire.normali   return mon    s nes    stylesheeoaded = have .
     i = 0;or') {
.require =f (mod.map.isDefmapValue, since it                   uri: mod.map.       // since it is easi       if (mod.map.isDef        /Ignonfig.mma delimi         paofare regto i            var c,
             PrefixOwn(confequirep    /firs i -= re be v  mod        var c,
  nction (hat 'diwHelp     re* in ame rack         s alion y 
     ay} ary                 fla    Cs   for (j = baseParts.le,                in) :     /urns    //                       bootstue;
         am          }mapValue,      ach(f (ary[i]tream = tSue;
    var "/rce, deepStre = e.')) {
       eturn;
              ts.length; i > 0     ance itpath,e name, then fig, mod.m                   nit(ue;
DEFAUmtancbenstanc      }      tionempty/ For pache as one
       funcname             ep at le      eturnine a console            / to rts.length; i > 0st    afile.fig.mergedare re    originalNa    / !is
         }
            edmod, tracdocument, impto fe m      n shd toeturn    C musLibLoame,ut: mod.map.id,
              .org/docs/errors.html#' + id);
    [defQueue.length - e = id;
                    ret  id:  pkg = getO.map.i
     to;

   just  }

 as            Right               undS              le': fun                module;
   .
   ",od.module) {
    d = depMap.id,
 +      = nameParts[0];
     mod.error);
            } else {
         traced[id] }

       ull     n modirReg,kCycle(          urlEurn media  //ontext.evaluateStriO    ndefinebeen m(name "all"ut n      he module ar           //if the thaen matche    (atched[i] &    }
    ^\oper/ns
      }
      \s*    '' Keep alread               if (pa {
              rmalize(namefineEmitComplete)extFac        art === '..') {
              nd only if it, funif (mod.exports)pass false?
            //config        since itmod.maprent modu2);
 sionnnction (depMeName segment match = depMap.id,
                    args, repass false?
   +      ep at least one non-dot
  ;
                            mod.check(); //           each(mod.deuni    t;
    (mod.m      burkep canit as one
       pass false?
     pass false?
  n  c || {};
                        } 2);
          done if this normali//iion = fig tarrr, h. IeFun    , then  for wai        if (func(objIent module maeconds of 0.
         mod.mn onEr be    dOpti            return normam/jrwefined[stanc ===      n    /      convertStream.r          /config.waitSeconds * 1000,e': function (m/" ?rval = config.wa:d for wait+tSeconds * 1000     }
        }

    [],
  .org/docs/errortion onErrding = false,
    )patha result of a cycle break.
{
        [],
  name a txedUr        coloundefi     mainconf * Helper function fo    breakCycle(ent m
           beeues     //r a Java/Rhino or Nodeistry, f[ding = false,
    ameParts[0];
            ;
                    };
                              map = mod.map;
           * Helper function fo           = nonfig,ripts{
     [],
  = pkgName;
                onfig, mod.ing = false,
     inCheck+ pkg.main) :
                                      };

        exeak.
            lat.ctory.getGloba

        /**
       r) {
Cycle(mod,                    mapValue = ld be execu        ly        !isut theuld be execparentModuleMap is provided it wie module shou            dexOf('!') : -1;
            i            mod.n inite {
         is up, {
        m/jrburke/requirejs for details
 */

/*
     && name =mod.maprr,   }

                if           Seconds * 1000,s: defined[mod.m            if (!mod.enabl      });
                }
            }
            };

        function cleanRegistry(id) {
            //Clean up machinery used           waiting             } 
         Seconds * 1000,ine a console             }      dele * Helper function fo  //url()    conds of mod.map(#5)od.fetched && map.isDefine) {
.isDefine)Id]) {
     .isWe = id;
        e.requir, (pc, Ciuirerr, , modjust tg Requthath = xpcUfirst s = spif (  }

                if (!mod.erro    if (!mod.eelse {
      globalDe registry,
                    es a module mapping that = true;

                                 .js 2.1.8 Copyright (cwaiting on a non = true;

   ,
                //It is possible to disable the                i = ne      se {
 fig targete      n rerefi    },
);
    no/ut n  id               if (mod.a   /toco         i -= 2;
             //Feck = false);
   
    //Si:ns {String} normalized ndule = false);
   e': functied, d/ inst(d modules.
 : func||ed modules.
>               err = mak/")               if (part === '//I modu+ waitInterURL,         expi        //m/jr     , onlyndMap = mapValue;
               ix);       //if this ther ifut for moduleid = depMap.id,
       == 0) {
                    // No                        process\n ng isime + waitInter             e = no                         returnl, but catches the most rect.apse ..expir       mod.on(name, fnure o      );
              },
      Value = getOwn(map, bure o             i >baseP--              prefix = name.s   }re o[i]ion (m.od.module) {
    n resource, or there utsta    ,  /**
         * Given a  {
            back) && stillLLoading) {
                //Somet                ack) &    ]oads, //if a timeout is not already in ef the vag is still     , 2 normalizedBaseParts = basePart arra -=y, and lop off the last part,
                   break;
                                    modId = map.id;

 "    '';

  tdule: fxtNareturnream);
                    inStream.ini          //beeoaded) {
           i, defined[depId]);
         if (!mod.efix,
                  */
        function n       warnuleMap,
                idule          if/If still waitin } else {
       
            }
        }

        function checkng(1);
            fit !== 'uunction breakCycle(mod, : inCheckLoaed, processed) {
        :thFallback(m  return;
             }
  not bo       /ame via require.normali               prefix existsForNode,        err)ce it     lse {
   ID.
       ) === '\' &&
    l    t.
       if (first('/');

        ibLoio    eNameay splm/jrburnon shodefined' Rese fileName = e, bd);
aintenifierffecRequisof just edojo Fh in the configlib/rhino/args.js
        rhinorgs = args,
 url,
                his.en       formore inits if already done. Can () {
        false, ja      //are.mod.rmalis$/,
        car reqnts);
       Can happe function module().gd') ||
           {
            cwd: e on fronepMap, name,n if there
             e: functthe multiple dered,        if (        ited) {
            nction ( returned = {},
  return/' + path;
               uf-8";} [e = getOwn(mapV] ry[iag       nyrototype = {
     fileName = null;
fined' && typeof selfjs  *
alize(prefix, parentName, applyMap);
            ithub.coig object.
        cfg = requirand d       });
   ents.
         */
        function tr(inCheckLoag.shim, map.id);
             return [false;

            if.jod.map.id + '/' + pkg.main         moerror listeners
                  //If th     function on(depMap, name= baseParts.length; j > 0ptimizedLib, existsForNode,           this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
           jslib/ze agahis.factory = f  if (this.inited) {
                    ion () {
        wn(config.JSot
           if (errback) {
            d that ]  //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                //If no errback already, but there are error listeners
                    //on ssign tgs,
 normot app  return;
        here are        h in the config))        .'          normalizedNam forooleajust try'rhino';

        filmeToUrl(nos.enable1& stil'    plugi           if (part =* vim        e.or 1, 2);
        , prefix);
                   fileName init lots of This is a   }
 cle breaking cod, nameSegment)) {
    ndefineFunction(require)) {
        //as  if (!f     });
                }

     //          //RJSare regaitSsk function (mod)  navigatif (option-') ===if (option    'non}

    getModule(depMap) gs,
ainst         fix =if (optio]ormalize         if (o  norm        if     };

        exist!d more ',
        commentRegExp  error on module    if (ongth)  there
 r.return document.getElementsByTagName('s    if (options.depExports[i] = depExports;
        '"ble er evilpath. UseenvironibLoy enable this file. It is
 * the shell          **
                   if (!t    }

          that may conflict can be separate.
            suffi              istry, id);

      endeOwn(registry, id);

     /jrburke/requirejs for details
 */

/e done if this normalizati getOwn(reg = xprveLies.
   LibLoae;
                return onErPase,    js fil* vim:am, encodFind r         Cfdefiive pat          waitIntera plugin managed resource,
           dependencies.
            path) getin to load it n  for (j = baseParts.length; j > 0; j -= 1) {
module ID.
      ame segment has config, find t error on module, so it valuchecks.
               name.su  norma        mod.en modu is:uirej eg(inStream.               return map.prId = 0;
                        checkLoaded(rr) {
         cies.
          +ed more Function(rturn document.getElementsByTagName('s        return false;
        };

    } else if (typeof Packages !== 'undefined') {
 Map.id,
                mo{
                var url = this.map.url;

                //Re    plugin
                var url = this.map.url;

                //Ree();

   parentModuleMap is p        */
        function norma getOwn(regthis.WMapsundStarMapefine it.er dependee mapped to a path.
        , basaram {Boolean} applyMap                 breakCycle(mod, {}, {})  }
  ) {
                    ap && (baseParts || starMap)) {
                       }
        cfg = requirejs;
        requirejs = u          Requ    ay splap;
 orts mod.map.id,
tion =    mot the directo fileName = y, 'one/two' for
se is a packa  //Indicate this module has be in
             ame = a,
             //are multiple define calls for treturn;
             thired,k,
     {
     urce though, keck) {
                    //Rr for errors          /ror', thCsoding/,
        co               igator,
fined' && typeof selfcs             //If no errbacr);
               ary[2] === '..' |  vaa process.urce           each(mod.deJSd by jslib/rhino/a is callrignfor  *
 the deps.
                    err        //Plugin is l              ifult in che       //of doing tundStarMa) :
              pCount <         {}         return norma},
    charAine onfig,edetch( map cdefiaxportsuman rasthFallba  /**
     * Simple function to mi expired) {
           ?         //of doing th:or) {
            ileName)).exists();
   kages may   //Fig {},
Textnfig.ibLo requirejsVars, nav                       wn(undefEvents, map.id) || {};
 e, so itap;
   .
     d) {
               ame segment has config, find ',\n   //Remove .       had       ], ijsm'       y.
               }

                expired) {
    le: false,part === '..') {
             unctior defiif (mo          i -= 2wait interval by usingmatch in the configCs}

    //Si.    oad it n 'this' object is specified
    /ontext(context.js 2.1.8 Copyright (c};
   rid0];

   normalizedBaseParts = basey[0] ===}
                                //* of the line. Keep at least one non-dot
      o norma)) {
                        /*/ of the line. +          checkLoadedTimeoutIbe relame];
                    } else {
          e, baseIm      map.isDefinetch();
 e = normalize(   return map.prefix ? this.callPlugin() : this.       isDeffancy though.
        if (type              /  pkgConfig = getOwn(config.     //ask the plugin to load it n      }
        return trimDots(nhis.map args, rea                 ||          } else {
           return value and et:ts=4:. After that,
                                //favor a non(c)          is.callPlugin() : this.load();
 //KeeterInputs.map,     riasonable

             pkgName;
                    }
                   ing to load. Wait for it, but onl.callPlugin() : this.load();
       name = normalizedBaseParts.concat(n the line.         Components.utils['imp         t.
                    pkgName;
                    }
                         exports =         if (applyMap && map && (baseParts || starMap)) {
ts = context.execnewule =r a Java/Rhino or Noderror !== defaultOnError) {
      , mod 'this' object is specified
    /nc
     * returns a true value, it w/[    not   },
 ined value.
                                    exports =\s+expor ts;
                                }
                        {\sexpor{ts;
                                }
                         ay(it "}ts;
                == 0) {
                    /  var e =multipegis     ngExports) {
                                          exports =(    )   }

    ts;
                                }
                       (;
                                   //Check fts = getOwn(undefEvents, map.rr) {
                 //of doing tan array of path se        }
             ror', thisexports);
            cesseizedBasePartspart === '..') {
                        //Do a copy of the dependency arrayQueue = [],
     ..
o if (this.td{
    d/orrop(d    equi{},
.tx err              inly do itrn f\n"rrbacs * 1000,
       ined) {dirports +"\n-               \n           }
   should be execumod.defineDep(i, defined[dep          +       ld be execumapguments);sole,)e;
            }
        ole, sourceLoad) {
         art === '..') {)  }, 50                       id                req. and timethrowin];
            this.plug             :            y(id     //Check fay, so that
                //source inputs are,
      s              exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetopg, nameizedName r);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                   k out of the        object Array]';
    }

 lLoa             ete enabledRegireakCycle(mod, traced, processed)s
        var e =x);
        
          eturn Combdule
 //config to speed u

        /Accountorts !is = require('fs');
rror !== defaultOnError) {
 standardd[id] = true;
            }
 d,
     s.
     leMap,ts[1]  *
 !isNs.defineEm/\t <     alue      };

        existd,
      defined value.
         n(map, basePartd,
     ice(0, j).join('/'));

                               r !isaseName segment has config, f                     orts.
      r !== defaultOn }

  exports);
            ) {
                       izedName              //tFunction(requirthis module t {
                                    

     nly do it             } else {
        lPlugin: funis.callPlugin() : this.load();
 

     ontext, thisop, then it means  }

            inCheckLoa         les.
concat}

      remember it.
               
            if (applyMap && map && (baseParts ||               req.onE           localRequire = context.mald be execuforE con and causes
               mapValue = getOis plugi             is.callPlugin() : this.load();
 urce dele parent        return map.prefix ? this.callPlugin() : this.lparentModuleMap is provided it will                id ap.parentMap.name :ptimizedLib,tched[i]) :.module) {
     pt(idalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defineds]+)["']\valufineormali.}

               }
        ndefine             code ha module mapping that     errMessagapplrrqCalls, function (mod) {ll this.check()
                    ed', bind(this, fuipt(idver if ae = normalize(name, parentName managed resource,
           ootsim.depsr                 foundStarMas.exec_semid modength; j > 0; j -= 1) {
    StarMap o_mangl       as a                    //Make        should a.ast       (                  parentName = thi            name = name (value) {
        squeez                
                                }
 ue) {
    gen_cfor                       enabled: true getOwn(regmax_    _dexOf('!') : -1;
            itrue,
                            });
 e;

  if (this.depCount   });
         s, and the waiting load is something
           = ptrailorts                   Queue it      n
   ne {
 am);
                (isFunction(requir= 'existing requirejs in        */
        function norma          portg(inStream.;
                    /for appntextn modul\r)?\n/                rror('timeout', 'Load timeo/for appdefined', bind(this, functio        this.d         e registry[id];for app err =      this.init([], function () { return valut error on module, so itormalichecks.
                        mod.edependency.
     vents.error) {
             s.callPlugin() : t                   if (mod) {
    ized, no need
       ze(name, parentName, true);
                            }) || '';
                        /Account        efix)/Accouefix)fnforefix)!mod)   //Fi
                    u return e{ return;
      logging. Don't
 Map waitinepMap, name, f'    fileName)).exists()Name, applyMap)     }

 &&    delete       /'){
      ing map config again either.
                        normaream\S]*?(       error list as a d
                       .    rn vm.runIn              if (!mo getOwn(registry, id);

                    mod = registry[id] = newireModulou: prefix,
quire b      or('timeout', 'Load timeout                     });
      //Normalize the ID if tireModulimalize(hey wi           });
ave a base name, try to nor           =          this.mtion onErr             each.js 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All alizedMap = makeModu2ap(map.prefix + '!' + name,
                                     / typequir        }
                         loa) {
               .etOwn(tr mod.defineEmitComplete)) {
lready be2.     y      env = 'brr = err;
uireModules,    .jsto know the
              'mo       //since they       if (m defQueue,= context.makeRequire(map.ized')t) {
                  } else {
                   ocalRequire = context.makeRequire(map.ized') === 0) {
 duleMap =) {
                           urn valu          handlers = les =         ;

  ire) {
          p(moduleNamme),
                            hasIntn init

                        //As o = map.name,) {
                           duleMap = mao reinforpMaps.push(normalizedMap);

                                  //Make sure it                }
                () {
                        return map.pr  this.depMaps.push(pluginMap     //that moduleName in  });
l
                             if (plrr) {
         

         (errback) {
                err';

         d);

            if (hasPr== 0) {
                    // No               //Turn off .js 2.1.8 Copyright (c) 2010-2012, The Do        */
        function norma                          }));  });

                       }
                                      return map.pref
                        }

                        error) {
                            notifie }

    /** vim:R '2.1.JS: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http/

            });
e aga
          turn mmunicrmal (typeof  {},
 syst     ttp://Us     n has         isfacts poneow for a roff i = Cteners
s,
     chodingmod.maps.exec        urlia   *So(thiirejs.exec opt* in
 0;      gExpdOpti  id:texteva  if !== 'undn (deb/xpc ID tanizedBa.    function hasPathFallethod to tran    * Internal msfer globalQueue items toripts !== 'undelobalQueue
//NOTBeca }

     (typeofhPro  //      text);
   re.u          Cc, Ci,
 
//              me(),
s, id);
   '2.1.P    e.
   eue() {
         globalDef in browse     */
        fmethodJ of 'prim392, and cause      y spin.no contex      values sinfQueuark thngth) in.no = true;        im
ary[2] ==lLoa     Ruthe        part = has       }ream       
         ing);            (moduleMa
         getOwthe        //Su * @param     m     ');
    b(i = 0adFileFunc !     }

     }

   );
    tormaholn error;
       ents);
    ModuleMap.name     //rrray]';
    }

    /**.error) {
      ction    //resoing);
 },
          lay       //prefix e = geB{},
erobalDefQue(= []?)e([moduleName       arAt=\:ay.p\.\//  ap\s = A"']ect.prototy     ldNew          = '2.1.8s.ne plugin'
             oldDeft) {
             normallocal {
        and ..+ pkgCo    n (deexlureste enabledRegistrrap scr  //are registeponeinit: s = sprterInputgExp * fore enabledRegistre       n onth that* in      .jfunction break to
                 ually true;
      existsForNode,t (ct "*/
//N"Registeraback =  = {},
kep= {} evilbetwee will be.
 *= {},
            s     ful       ileFunc     r          , options) {
ed && !th    jsSuffror', th()od.emit('error',= undefined;= '2.1.8_ thishis);
   }

      ntext.evaluateStriSy[idd raw gin's this.,load, by        load though, keep ed = true;

  dRaw           }

         g that thalls tnce it is easie      ID thn          },ports) {
      mediate calls t//of doing thatned callbacks
                     //for m');
nect/arduleNamep] = valuetent load
                //wDothers //TranUrion (    }

     w calling ced = true;

       name may be a existsForNode, akesled) {
   mod.usor a red &enabled    brsup    c ugin r        enabl.map, {
     to, throw error if (mod.map.isDefine) {
  document !== s {B         if (text this.enabled = trueisStypeof duleNaU     /Bind the  {
                        bgetery {
 xpired,     os
  or    s/**
     s beeans ei     net     callbacks
    a functext.ee //  = ne    it    t modutoo dy   }c. N     halugin.load(map.non Windowout ase, a
    {
 oad, confr a rur          cstry, Queue = [],
       drivprob (e)c: whenred &DEFAULName +  conow for a            Queue = [],
     ananRegistd mod& process.versions    err = make/);
        &&
    
    //Si?         if ule,
                 andler) {
 '     :            Exports[i] = /dFil     rue;
            }
                              //calls in the text, ched[   },..map.iule.s[urlameParts[0];
            d);

            handler(t //no path mapping for a path start       lict be call            (thi   //If still wa     {
   ary.splice(i, 1);
                    i -=+= 1;

               

       ating a module instance for
              ng);
        };

                                normsts nUrlWith    hts Reit fmalize(), wh            depMap = Adstanc    mod.usiif ther     log('x.jhis.ma     as    & process.versions
         ExSync;

  conv                //Normalize the              nc(ary[{
         'module'
           impo         on(depMap, 'error', se {
               d(this, functio//Overridctory, '_unnougin'somman    dts t      u.
   ver ieaturxports) {
  ame is not reliable,
                lete = true;
       dency ca=ce the plugin'            i -= 1;
     ldEnhe Dova: falxt.e     aded, Module, conteally Ppire         })Mally n: true, s                  }
 Iniain;
ble each p.= va                  }
 Ca
       
              p =       tion (i, depExport }
      = splite. That ixain mod     {},
 process
        Node envvar pr_         readFile: funcFginMap.intext.enorigine{
        syn           }
              aryTick
            f Available via the MIT orfnsh(normalizedMap);

                norm          edFullExe tha.fetched = true;

          
              },

            on: func {
           },

            on: funcMap.iShimEto
          g. If the only stil in circ&
    him     }))parentModulelers = {to     g. If the only stilspntMau   nam && noLoa    if * in tched =wn(con || {g. If the only stil {},
        though, keep goin        

  (!cbs) {
       throw newnd .     }));

              (config.cnet flag mentionin modId = map.id;

             */
//N = err;
        }
        return e;
 '          //Bind the vale error handler was triggered, remove
          tp.idnquirejs !== 'undefined') {
        vt);
    ea  not name of the baseName's
  around foModule ifhis,    r a while      //suppow eruirejs !== 'undefined') {
        if (isF Module inr      nn inite*/
//Nbstr prefix, nod  de'r fileName, env, fs, vm, around for a wh[];
    n the registry.
                    deallGetModuleistsule(||     re.ts[name];
[];
    }
      ckwards. If the fu          getModule(makeModuleMap(args[dules ror handler was triggered, remove
 }           }
        };

        fu'}( {
                 //Ski load is something
        ;
                 ng = false;

                this.ch);

          cb(evdepefix)                readData = {},
 r i    Event .ithis.map,
          = null,
     IValue            rn vm If not it will throw an error,eck();
         this.check();
          }
        }

        fif (ieName) {
    e, func)            }
            mpValu  //Sus', 'moduregistratio             * a real name thao     !modpeof reue) {
                       Fallbacich wi&&       n             , which w      //Normalize the ID if the peck();
     [id            if (this.errbating load is something
                   ( a script node, get tidbPath(moduleMaif (!bject}
  r-in the registry.
                 an event from a script node, get the requir               //favor that overpush(moduleMa     function gdefined', bind(this, functioode.remove'2.1.8{
   (tenerd = 0;
                        checkLoaded();
    }
       n inite          //Skip modis.enabling = false;

               this.events && strap scr          a
       if ;

    an error listener, f         here       cb(ev}
                    }

      = require;
        require = undefined;
            context.his.de([moduleName       Map.i(optio            }
            e] =lts.cbs) {
                ary.splice(},
                 asap.par: fuent mod                    });le man      :   //Iing,
              /&& map['*'];

          rea        s== pkgName + if (t) {
         xpconne     if (mod.eoad()function (ually w     nam forhis.md modules in the globalar args //refer         jsm'isteretis evt) {
                    oredNaly       mod.on(name, fnined', bind(this, function (de   return;
                    llow 'load', urlF     f     //to support and still makes sense.
                handl                 emap;
  dDEFAUthis.e     artScable(o           readFile: functleMa     rop))luginduleNameepExport? this.pkgCabled            
                      enak    ONPueue.shift();
           and wired up to this module.     e;
                return onEr            id = depMap.id;
                    mod = registry[id];

'require', 'exportck));
                        }
                                      //'//f (!       lly w   ifrela    expired, c
     fQueue: d          on(pluginMap, 'defined', = 1;
Map.inameMape new value.
  enable if it is aduleMap: makeModuleMap,  *
Tois use                  If setting exports via 'module'       s', 'modu {
     **
        dule = this.module;
               bs = thiMaps[i]   id:thei    , parName's as-i= pkgName;
                     this.check();
     e new value.
  vent listeners on the node.
         * @param {Event}in
     ().     guments);
     timeout is not already in effectthe cont            //with the depC       efox 2.0's sake. Not
            // //Usall old br) {
                   * @param {etScriptData(evt) {
            //U       //Su                }
  * @param {O || isWebWorker) && !checkLoadedTimefalse, java            //with the depCtch', 'ox 2.0's sake. Not
            //text.sta other

       ,
    depMsodepM    if hole.
n error listener, fuiremodule')
       ne on () vil:      sneed     y thi -= p === 'stringm,
                    obp: trulocks.factoryoff i;
   equireModules;
        if (err) {
.id] : null;
   is, is.ma#263ment);
                               eModul                 extAlt)h dependency
                ea              on(depMap, 'def                   }))      if (!config.mk: req.nextTick,
            on      foundMap = mapValue;
           == 0) {
                    // No basbaseUrlhere since it is easi Errothis.ame.substring(2andlhpluginMap;
                 eachProp(ct);
s on         mod.on(name, fnventListener commened = true;

    adA(plu     .               giste) {
                                 pkgs = configgist= config.shim,
                    All Rights Reodule'
   cjsTlog(is, s= '/';
                    }
           //Usthis id) {
     e] = n.pr     this.des', 'module'
   e.getA     //they are additive.
                var pkonsole: false, java:  true;        

  : http://                return map.past part,
                        //so that             if (basePar     frefix,      etModas one
                       unction (value, id) {
     oduleNa    
                                deps: value
            xports(value);
         nge');
         
                        }
                        if ((value.exports || value.init) && false, javais.check();
            conf: http:odule'
  
        ute id;
        e.requireModonfig.map,
                on.
     * @lse {
    true;

 ()             NName + knowif ((value.exports || value.init) && !v{},
  rgs[: truin {
  bs = thits=4:se(thisitap] pa                 : thi            }
            },

        ,
    p, i) {
mod, ha             r
    
        or (i = 0;              value.exportsFn = context.make done if this normalization is fo
                            if (!config.map)path) 
       //Tran  };
          
                                deps: value      }
                            mixin(config[prop], value, true,  //Enable each dependency
                ea                if (this.errba                      foundMap = mapValue;
               ctive) {
                         //this name.
           useInteractive = f            u req.es    a(foundMap) {
                        b }
        }

        fuan b              +ion ()+ eiting to load. Wait for it,           foundMap = mapValue;
               } });

           ny trailing .js, since different packagefor the context.
             * @param {Object} cfg config object to int                ontextme && file = ge,igure this.the ma eachPro       lizenam);            }
            },

            //     wi*Stringt('/');dOptiactundefinet('/');node,
              value.exportsFn = context.makquire([moduleName        e([moduleName], loa     /                       }
                              }ng to execute" mogs[pkgObj.name] = {
                            xin(config[
              
/*jslints) {
   this.inited) {
          //If module already has ininode,
     ame) {
    

  is use    , like URLs to loa[3hino';

        fileName = args[0];

        if (       //Adjust packages if necessary.
s too
            * @param {            }
            },

            /**
             * Ch it,
         * and 
   pkgObj.name] = {
                             //be passed in again, and config.pkgsue).i    var mod = getOwled once per resource. Still
                }
                     ameTo }
 node,
      called once per resource. Stillhs are normalized,
                            //an defined as a
                //confi exists, reqMain, loadedO || 'main')
                                   //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function //          ocess !== 'uing,                     value.exportsFn = context.makbj[prop    v       bs = thith, /*Strinrgs. */
     ow will be.
    functionrgs are id, deps,       while ( jslib/xpif (e rhi    o} elstion (mod,uleName        var ret;
                    if (valgs is the internal transformed
                        }

                //Save off the pathgs[pkgObj.name] = {
                            ary.
          th
                    confs.require.makeNodeWrapper(string),
                 ived.
kgObs      burke/r);
                    }
                });

   hasteratinodule'
   
                base);
            return false;
     ndN
                back && isFunctiouireJsBuild = true;
  pkgObj.name] = {
                                                 so main paths are normalized,
                            //and remove unction splitPrefix(nce different package
                            //envs have different conventions: some use a module name,
                            //some use a file na         checkLoadedTimeoutId = setT      if ((value.exports || value.init) && .pkgs,
                    shim ava: false
                  ') {
                        if (isFunction(call         checkLoadedTimeout                     .replace(currDirRegExp, '')
Rights Reseo baseUrl in the end.
                onen                       }
                                    //so thatgs is the internal transformed
       text.(mod.dewn(confe] = ithub.com/jrbu//a normal, com   //Create a brand new obme, f,
  ach(c            y           {
                            mixihs: ict.
    varihe Dopath.
       les, ment);
                              l processing,
 : function (relMap, options) {
                options = options e] =         node.remo                value = s defined as a
                //confi     /imfrom    t(args[1fixRegExp, '')
                        };
  ttribute('d    onen          if s defined as a
                //config obh));
                 r     tils.File(ns) {
                options = options || {};

          if (!cbs) {
  e new value.
  ttribute('datcommandOption = fileName.substring(1);
                           contextName kgObj.main || 'main')
              config.shim,
                    obkgObj = ned[iunctiErroreil.cwd() +ningodule If require.get is
                can
    ile.
 */     CigeetMot || {}     nor(err2, The D         value.exportsFn = contextue;
      turn en(co     if (!mo    }

                                */
        function normalize(namix,
               odule:c                /e her process
                                 e.      Tre                 context.nextTick(fun                
                                    foundMap = mapValue;
                           is.map, true);
                        id = map.id;         if (!this.enabled ||             if (relMap && hasProp(handler/
    /Bind the efins with                           return!penden
         unnormalizedCounterreMod = getModuled.skipMap = op        mixin(config[prop], value, t                                     endene if (name.indexOf('./') ==).endsh(normalizedMap);

    == 0) {
                    // No//     un(typeof defactostned[m        mman       //Marueue items get properly         nishme defines could have been added s               //Mark all the dependencies as needing ) 2010-2012, The Do            if (!mod.enrk];
     achPrhaod.erreue: rectory, 'one/twof (req.k = errback;

         arall = tap] pa        //Dm     cernect/c
    ir(msg + '\nhttp://r         xecCbnabled) {
       , cbt || sinit   if (!hasProp(defined, id))         (!cbs) {
     l proceeModul          if (!cbs) {
  les toner(name, func, false);
    oduleNamePlusExtharAt(cfg.baseUrl.length - 1name, functi(!cbs) {
                 checkLoaded();Rightb.__ {
    JsuleNa0], n                          //Save o     .lastIndexOf('.'),
                cbn inite to
     */
           this.check();
                     
       
       Element;

            //Remove the lis              ea (node.detachEvent t.lastIndexOf('.'),
     (value, id)  sure the basn bei   //unfig.map = {};
              tream, con -1 && ,ing(inbind     /call for deEvent harAt(cfg.baseUrl.length - 1) !== '/rn ostrinent      },

            readFile: fu                   Intera it is too
           Event &);
                    }
                });

            eeMod;

 ?in beipMap:          0) en.0, support just passing the text, t)));
                        }
       ing,
         [ IE. If nnfig.map = {};
                       easy enough
          IE. If nng defined.
                        if (relMap && hasProp(h //to support and still makes sense.
            var nodencyn inite      || evt.srcElement;

            //Remove the lis function (pluginMap)          //Set flag mentionin function (mpMapgin beimntext.nameToUrl(normalize(mo, like                       retur         /od.inited && !mod.map.unnor, like will        }f not it will throw an error,                  node.removeEventLislls
        urlFetched: urlFetchext.
                 Ithe event listeners on the node{
                    define() calls tod modules in the global         dule:odule mwai      = namequibe     module
() function.
               queu    ds.lenov    toing i
    f (reqit as one
                          makeRequire          id) {
   ll, n!      loca||       loc       }
 supported, but this one was easy enough
                  if  //to support and still makes sense.
            var nods, bind(th        id = makeModuleMap(id, relMap, falseequire,
        nodeDefine, exists, req (name) {
   true;
       ClearerterInp        useegistr.
           && !mod.en         lue;
        //mod.ex functiohoulher a Java/R onErroame is not        ._) {
          this);
ect
 function (         },
me =           //and wiredMap.i              //Set flag mentioninssignl    gin's name is not            undefEven                            //using        makeMo                             undefEven normalize(naependency cs can
    } },
     re         onmod.eturn localRequ           ret               })fig.pkgs,
  ent. A se('vm');
        paMap,
      :abled: true
          onError,

          * is passed in for context,names:  },

            calueueAdded    * is passed in for           var i    * is passed in foronfigMod;

  bled: true
               if (!config.delete enabledRegi arra          (depMap) {
           //using:                     e stage. Allow c                 e an easip   couenabliistrth, /*Stt modul      ory. Sfo            handle   }
   r for errors on this mod              ttempted to be reloaded
                        i) {
        his.eventseven st)quire;           obal qstanc       at the mas can
                dummto rer (i = 0;

         tched = {},
    //Find     lice               mod.experteget     th no pat

    e nameToUrls can pkgName + hronou                tion fuleName the        ma        });
     //important       usage.')ignsPropt to allow valuew.
  exa    stancjust twman r          // {
      }

   ned) {
           }led) {
                       = moduleNam   if (mo"wn(con install old breModul: function == '.' || segment === '..';eModulct.
            [s us            if (this.egin.normalize(name, f      n inite         || evt.srcElement;

();
        {
        va    //If mddocument, impodre.
    tili map
             if (typ {
      ().getTim.
              bind(this, functio
    by th       while      if (this.map.unntextFactor             ed to be reloaded
          context.eToUMana    run some                  ts = nag    oName, applynameatMap && ofod = getOwn(registry {
     o         n(con      while          }                mo/Probably   //useful to know.
   enabl                   {},
  : this      od = getOw    d    trror.
     * @pa/ moduedRegeRequ     Bs not sudaths: map confi       val  if (           handler  */    vali        wn(registry, pleNamee,
      epMap                               var mrun * Interna    Libinedect/loader,
 lGetModule(argsnot tribute(xt.coeName segment match iis.check();
      rom a scri              //Save oon gertScripts, self, locati    defined: the event listeners on ents.error && thiAned[id]& process.versionsy allow und          this.depCounteue.shift();
   t shown h                  if (con  onError: onError,     is.map;

                            bs = thiDate().      ;

     type      actory))          ix) {
                otsure any r= nay wants);
     ueue();le,
            makeModuleMap:eModuleMap,
        the enfig callback is specifiError: onError,

                                                             the event listeners on the node               {
                        //A                split('/'        ap) {
         }
            }
      //                       GlobalQ    
   mod.ma    wn h this.femoduleye
       able(),
             se;
    ormatu        this.ther && fe
  = pr              value.expy: registry,
            defined: deit be              this.depMatched[ipt that does no     rom a scrieModuleMap,
            return;
                 vareme.s                   while (path. Use = 1;
turn;
                        } else {
                     this.check();es where
            ll define(), so just simulate
                    break;
            by
       ack,
       f)     whil               to allo           ex stiit  };the pathConfprobably shim.         ft()g Requi               his.errback));
   xpors from a sse.
 *          for reduleName,           else gmentetGl rgs = defQueue.shif {
     : function eadystatechange');
    athFallback(modu);
              seUrl ends in a slash.
      equire.n                       //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
   ://github.rts.join('/');
               so     trict: uneven str = true;
  [ueue() {
            //92, and causeay splsyms,with requirejs.exec()/tran conte true;     this.depMin ID ' +trictif you     pl     ince curren + '/g       enin  if (this.f                 alReqme ===is anky, on      }         ry {
    noi    //so thamod og        ype,
           Dir function (str true;Loadedred,  eacdefine call for thi             return;
              obalDefQueu.j thi, deepStringMixin) {
             /with  the dependency ar }
            };
   *does nopkgs, mod.paths;machinery used foreModuleMap(map.prefix);

                } els/\whis as a dlGetModule(argsNk));
       froctionas agaomTextpkgs, sincemoveLis * for     try of         }
                } e                         \\uireMng
            //e {
         {
    om it.
                    for (i Rightswork up fro    dep rentModule =ry, depId);
 true;
             if (confi         //and work up froine a consolelice(0, i).join('/');
  = moduleName;
                   h; i > 0e': fun         in('/');
                        pkg = = syms.length; i > 0ine a console.    if (parentPath);
        //In Node 0.7+ existsS modu
        s.
                 .paths;              //on this moduallban.pr cycles.
      athFallback(moduleName))               (!isRelative || index > 1)) {
         //a   a.paths;               pkg = hExports)))  {
  dep        syms = portsurce though, keep goinod) {
     ame)efin    file n                 are a fe.id,
 tion onErrare a fe)                  specifi= 0) {
                    // No            "N' + mo     syms = aths:zedName = '';
           } cleanRegistry(mod.map.id);
                    checkLoaded();
                 an be traced for cycles.
                this.depMaps.push(pnMap);

                on(pluginMap, 'defin.paths;
               return  c || {         } else {
                          takeH.lengt        n(registry, id);

        rted to a pa
         options) {
                options to the deps.
                    errback = bind(th                }

                         unction () {
                        return map.p     function on(d.paths;
                    pkg                checkLoaded();
                    });

  Jtanccop    //                 makeModuleMap: mak
     ===his.map.name,
 .paths;
            as a dependency for th               var err, cjsModule,
   , so that
                //source Dto arror}            {}
      //Do not do more inits if already done. Can happen if there
         //Do not do more inits if already done. Can ame module. That is nosion      :keep lookinrgs.js
       to a depMndefined') |.paths;
                                paths;ned' && !isFunction(require)) {
  t flag mentioning thh, b    ret normalizedBasePartwait interval by using["']\seam if (n(fileName)).exists()g = getOwn(pkrorts.
          oad rue;.
                    url o an URL with more in.id;       balQueue();

              //Transf-'x.jnfigfunction (mod) {
      ction
    AmdOr //Trans  * solely to allow the btPaths a separate              modId = map.id;

             if (mod) {
   he Dojo Foundation All Rightsa separate        if     s, args);
  a depend* the first path segment, e callback/Pro_eLoad   if        .uri   }""r !=s.depExports[i] = depExports;
   '__        =used to chet means there t the events: defined[mod.m    /* = undefined;
  rejs for details
 */

/*
    truonenably the errouleMpis,   /**
     * Simple function to mn;
                          //Have ueue()) {
             *
         script l    //onError is set, expressed in
    //dot notation, lite a, nodeR                  } else {
                                             : COULD   e,CONVERT           }

      soIf still            wllba           this.expoack, args, exports) {
                                   if (mod.events.error) {
                     ,

      }
    }

    /** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.8 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.    * Internal method to transfer globalQu         var pathConf                }
      {},
of tinstead of targeefQueue, so cannot just reassigof thos                     //if    fig.pkgs,
(     uod.inited &    rror: functi     od.inited &      rror: functiors, #3od.inited &     ror: functiisArray(pathCvt) {
                 var dain brod.inited &           r: functi

       vt) {
       *\)/g,
    var datt supod.inited &         [data.id]));                    }       if (h[data.id]));       if (haod.inited &rMap)back(data.id)      return/Add extensr: functi = true;
od.inited &       handlers = {
 r: functi          /          -   }
        * If the               this.depMaps.push  //Support anonymoupMaps.push(moduleMap);

                      end     SemiC modobalDefQue;(getO                      }
                }));

    this.en();
     a pwstry,duleNameame = aondenmopkgs, pkg,rtScModule

                 ing t** call normalize on status licenFallback,
  duleNameID th modul//maniphis,lean up  }
        && fi        h(value.split('jgs = con           (config.cnErrer the nce. Att    //eue ite/     jsS paths: true,
o notst sp       if (h.js. calls to the dhort
  s);
up   if scope use.
  assumes thin   }
           re.
             pplyMap) {
            var   //to thiszilla.org') {
                  o the djusteachProp(registry, Value                   d.

  lvap(mdiate calls to the d[me = (prefix ?
           /dck()mi);
        }ge name, then lookingound) {
    ().getTi      d the right con});

                //Merge shim
      ig object in the call.
              turn;
                  entMap.name : nul                               */
       ent, the pareapp|| '' }

        ry = {}(depMap) {
    a
  (depMap) {
   ror', th: "ormaliete enabled= defaultOn: argix.
  rts already          ap;
   //Fin       part = i      fig.context) {
 e config.
                test(modf (!hasPathreJsBuild = true;
    
        contexthe plugin to load it nfig.context) {
 //Bto redo t,that  //fo/le.
    le (defQcopid();unles            ret =        i  return,d to redo thstanc/,
    s .foe,
  moduleNamdirE,
  am); 3' ?
  lugin       }

            contex      name

      ndefi(depto fetch. An o  return mSthenJS            se thei;

     tn relM   nonges tJS    d preithiss/init  {
 on (y urlf omi  comp               rComp2.1.SI. ame,a           i will b {
     intath);
                   addarray, thback);
          be relas an array, then it kip sp                if (found) {empted to be restring') {
            // d     , art have not co           re not ste current    (diquire alue of that moto exec        */
    rry, depId);

                    pkto execgs th/Timeout.
     * @rray(deps) &o exec           ret/                   conf
   etTimts = th        up          rtSchort
  art.
    r     ab    "maif (!at 'this' leName &op"nly be true if isteisNorhis.mp = getOwn(the mncy string naBind the     * Ex        ad(context, id, url);
              'Sath.
       -ror', this.err             '/');
                    url pendency.
   mous module a         /     * Ex.asis useeadystatechange');
      rl) + url;
  (context, id, url);
 //Used to tion () {
                [id] = o        /   }

    ret: newContext
    };

    //Crreq.vers             break;
         /     * Ex           return (mod.mMect/    en    rMap =in th         ble.
 */
  an anony is s       bid);
    

  ringsepar//Skip ml be       rop)ion showH**
  a depen-encyod.inite*Map),
     if afetched
         ret             the rsepara {},
 proorts;

         nfig);
 return mod.ueue.
 .
        pMapseNamdg to th) {
   ck));
        le (demovn/loc       'eig gets used.
                re);
    abling =    nges t         from p function     if it i
    ) {
 abling = t" onError,                   m {St },

      retu   name =     });
  nts.cre[prop].applynabled, this.fPathFallhe latests in tre[prop].applyle.
  ivconfig);
 equire = conton;

     to allowlso normmod.euine );
            r ' + id         globa(basePartroble(as turn delp Caj[id] =fig);
    };
 {},
       while a fil            var onError,, cm              MseElementS         ck       zedBa                  i, jElement.          //will    }], load);
  {4}aefQunly(dn                }
     a.io.File(e = u   'undef',
          if (cfg.baseUrl.charAt(cfg.baseUrt moduenceinput-stref-8";
a filathFallback(moduleName)) err the err equire.js object is specified
    /          expo[id] =jsle,
   used.
.js   return document.getElementsBy"me ===ly used in brow name = nthere
      to potenti(    exaturnleMap,nfigandahurlFeo stiwct on pkgdChild ilengt.            clea
                        //dots from a rela* Helper function foristrerr t;
          nt.createEleQueue,a {},g.pks;

     {},
 ror;
) {
                each(   node.tycomormae th     = {
to allowabling = resou ctx on intakeDefines() {
trin      node.char. O        = shim.hat tType || 'text/javascript';
plugin gs, b
    //Si= 'this' object is specified
    / onError,      led                       ror;
s still0waiting to load. Wait             document.Rema      rence fr require[defCont     till makes sense.
d = basequirig.xh(id, urf-8";To() {
 .
      },

            od = base: onError,dule.
  aiting for itsackage name, then looking
   of the moduls
                     //module will be e.
   _run(e.
     *                      //call for dep                ement.pais.depMaps.push(normalizedMap
    /**
is.de                 for (i =   }
    asier erates w(this.event.pa, requirejsVars, nav);

      athFallback(moduleNa use a sc+ funcnt.pafine a console.lo }
    Make t +l);

      s, baseNam    /**
         *                 nameaure any reate    },hmod)   } t because     globa       ts.length; i > 0ative       & process.versionsreq.create&& req.creat.
       ) {
                     node.setA'\nInst because Iy.
 uild system to sequan be traat do not match tter.
    -r.
     if ((!expired || usingat requiich fire theaseName segment has confi
        alue) {
                       an bejich fire the onload evi; jfor a
 j    if ((!expired || usingPathother browsers won. Intercept/ref.
                        if (textAlt) {
           node.setAttribuo (er    cleanRegistry(mod.map.id);
                            }
         turn;
 te('data-rad listener. Test attachEventNode;
  is.demodul requirejsVars, nav
      err t    },

    //thror;
args, reamodul     =r a                             /r browsers with       ode;
     }

                        this.depCount );

       /that doe;
  t an URL.
             * NAt(0)t    nction f== 'un"at         modul
                    } el
            node.setAttribute('nativeon. See:
            //httontext.contextName);
            //read https://github.co);

                            }}

                var err, cjsModule,
                this.depCount -=                //C        lback;
                    //Foude;
      {
            head      ext
    };



                      a
       return;
    mod = baseElicable in browser en       , src      e.
  liable,
             deskLoadedueue()nt && !isOp         {
                     

       ;
        ined[id] name) {
        localRequire([modPdefinede scbled: true
     d = funct    return fete enabledRegie = getOwn(mapV                 want custom error handling.
     * @param {Er["']\s, document, irequire     w     r it. SeLoad(moduleNam             e {
   emit: flls/init calls cha {},
    }
      pDaths:lementnst   /t or        p
                           0; val fo    ky, extName  }

     path       hererl) {
        Queue = [],
      nod probo swi     ed[id] urn oregistry
            if (hname may be a plu return ee.
    ict.
ot applide;
        if (isBE. IE (atfault.
        );
                r e = new E   },

 {},
          /**
   lse {
                                    ntext,
             with 
         ectoryports isNoreName segment match in th
      this.map    uleNa    is, fun        e execute
  */
    req.onError lugin allows it.r browsers art === '..') {
                    if (i               trig Available via the MI, modulodule mnRegistone-of             ft()   }

 g gets used.
,    /6-9.
              loa sepa //for thrue);
 .ild system to sequence the === hat is dmod = r errback, options)) ? '' : config.Dir(10 fixesrback;         */
on't caefined) {     e segment, see if there is{
           ;
      ier tocontext.onS//nonetOwntext.rjs = funeach(this.eIE (attext/javascript';
e,
      his.events[name];
       getOwn(regrback;t an URL.
             * N.8 Cr it. Star                ('?') back;  (ret to l     will be.
    function bi it. Starth.charAmod,, don't ct
                //can be      inay gi

        /**
         * Given a) {
    E (at l2.1.8',
        commentRegExp         //of the (\/\*([\say gi(\/\*(/Clean up
      stored o0 fixes the issues,
        break;
                                }
          ine ? [this.map.id] : null;
 ;

   stored oes noistered forumen== '/' 

    ia
       if (le.
            mod.on(name, fn)sertion.
            currentlyAddingScript = node;
            if (baseElement) {
                heagin ID dug gets r, usingion (ed, check fdoes not sudveScent use of importScripts, impores in t block                 log('S     //F                   },

          , baseElemenargs, reptError, false)null) {
                    return     head.insertBefore(node, baseElement);
           , falsee {
        don't capendencies as needing to be load} else {
                            mid.insertBefore(node, baseEleme      handler + e
       :if (b    }
     .           If require.get is
                          e aboutdefine',     i          no  //reev            return req.get(context, () {
    
                     value.exportsFn = contextght aftode, baseElemegment);
                              ght aft args, readFilhis);
            e,
     tion (depExports) {
                                       mptError, false    ht aft                                foun                         contextN        ction () {
  don't cfor .insertBefore(name);
            } catch (e) {
     (expiar args {
  ' at ' + url,
                                    handler(txRegExp, '')
                        }eName, (sadyState     le.
     e {
== '/' whohis can b
                //In a wp.unnormalized) {
              t() {
       ' thisDzedName a-main scctive') {
                return (intera        p;
    ence tType ||ea    oad, fa  //Fi(his e seed: ' +keep looking for uh(/^[\w\+\.\-]+:/) ? '' : config.erroght after          e segment, se                                    (        importScripts(url);

           suffix,
    y a nfigificationhasProp(defined, id)) {
                  dyStates wi                              contextName +
  eractive'            }

            //Look for a data-main : config.baseUnction (script) { //Set the 'head' where we can append ch mixin(config[prop], value, true, true);
                       fig if available.
            if (applyMap && map && (baseParts || starMap)) {
                nFe;
        contex     l ofstsForNodke sure any the mo her if (bye fi     ig objeHowever, onread   noe aboutbaseetInteruhandler          : this   //Grab     in the builnadverHowever, onread    if m fn(modtext(corl.ma[defContal baseUrl             tListen     However, onreades thing         ti = 'm/jrburkmod.exts(), f           ext(cy anwy, fgPath);
                  *('vm');
        path getOw         //reevthe optimizer. Not shsunctionath = src.length ? sOwn(c       t pathway          ')  + '/' : './';

                cfg.bas!cfg.baseUrl)                  executing t       }
                   //script onload  getIntera        requirejsVars, nav       e.
            suffix       g.
               ox 2.0's (name, func, false);
       tus 
             * callback forSuffixRegE._e aboutive')  executing tis useful wpath, fall b//Set the 'head' where we keGlobalQueue();   node.a     he Node adapt   }

 "new"         if (s',
                      //a in            aobalQu"load,           e, then j) {
    factory coul req.get(context, de//Put the req.jsoaded(           m/jrbur(basePnt is downloaded and evalua//'r the d'ioned abentsByTamainSc'ove about leFuncicket/2709
         makeModuleMap: makthis modu             if (req.jsExtbPath,path, fweird sefox 2.0's sake. Not
            //path, fall as one for
                         this.dep
                      the deay(value)) {
       orrespondin        fall balso adjust the baseUrl.
    if (this.depCount -="ERROR:   //a s bloc      }

     p) {
            var pkgName, pkgConfig,               if (req.jsExtRctio actually weNamdrrentTpath, fall Allow for anonymous modules
        if (typeof ". = script         toe = normal.abup frs ena                     if (plugin.normalize) {
            } else if (part === '..') {
                 n destroysIE 6-9.
              At(0)js = fuhis ck, errbac function           ma     if (isArray(callbacng);
        };

        exist installs of IE 6-9.
                 retur        s, b    //If no    mixinn destroys r i;
          n the registry.
                    dee was easy enougFUNC    contn destroysine(), so just simulate
                    installs of IE 6-9.
              tion    }

     return            ce to this e out base      cg(this, s the use of a module n      node.ontains sps =The           return lic   }

                t fire
   ent, the parent modul);
                        ret     //prefix and name src.jo interacti      * Converts a module name + .ext  this.errot fire
            map.id);
           figuret fire
                  mod = get= mainScript.replace(jsSuffSuffixRegExp, '');

                 //If mainScript is stil             /fall back to dataMain
                    if ion(callbackExp.test(mainScript)) {
          leNaluse cases become common.
       endenent,
     * active') {
                return (in: config.baseU     if (req.jsExt name.
  QUIRES thefoundI = i;
                                    break;
                         ed.
         * NOTE: this method MODIFIES the inputu, expo.map, {
    stryi -= doentsfig( because               Queue = [],
     ,

  ntext,Name      });

  ance (ents                      /duleName the n//CSntext.r         //Map already normali
                 //Theed, d     instr browsers t, the parent module,
         //read+      name = toad) {
       a CommonJS thing eve       this.                    .replace(cur               var id = mod             //could use exports, aluating thixRegExp                   /             readData = {},      //Bind the value of thaed: urlFetched,
       nerr   //If no          duleNaeNamehe;
 eb wquick              shim:            okupe.
                      isBrowser:!depck, errback);
    };

 alue, n no context        urlFetched: urlFetched,
      function cal                while         makeModuleMap: mak {},
                          mainScris = fun/Set the 'head' where we can });

           q.version = versiion to execute after dependencient. A sthe mrelMap.id, true), ext,  true);
 //to support and still ream);
                    inStream.ini want custos exist(luating then it means it is a req     }

        //Always save off evaluating        mainScript = mainScript.replace(jsSuffthere  execu(namhadow  if (!errback)                     /,
    n error listener, fue.init) {e(this     nothose dependencieske sure any      //meonn the command line
 at br     a modul        var m });
s in trn eval(quire, is a function, the    //This allows multiple modules to in a file without prematurely
        //tracing dependencies, and all though if /,
    ctive') {
                returndation All RigL*jslin                                  spiling
     * loaddation All Rig multiple modul/,
                 readData = {},thout prematurely
        //tracing dependencies, and allapplyMap apply the maueue.
                       }             //if th       mainScript = dataMain;d;
    ting           ere t           config[prop] = value;
   
    }

    fr before t = uleNais use eval encl= mainSc                      id = map.id;

           lso adjust the baseUrl.
    if (isBrowser) {he MIT or new BSD li && s
     //Set the 'head' where we can append children by
            //using the script's parenlDefQueue).push([name, deps, ca{eNam:s: requi}]);
    };

    define.amd = {
       .amd = {
        jQuery: true
    };


    /**
     * Executes the text.            if (xhr.readyState === 4) {
   {uses e:Fn]);
 onment-specific cal === 'string') {
                        if (isFunction(callback)) {baseUrl, if it is not already set.
val, but can be modified
     *                      if (plugin.normalize) {
     nment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text          //could use exports, aburke/requirejs for detai(env === 'browser') {
        /**
 * @license RequireJS rhino Copyright (c) 2012, The Dojo Foundation All Rights Reserved.
 * Available via t    }ion All Rig
      inding toModule: Mods.     ion (oLoaded, Module, contueue();

     de) {
  {
     unction (context, md: fua
         funct is downloaded and evaluated. Hooncat(mainSc or new BSD licindinas one
                        details
 */

/g.
               /,
    is useclosed with use strict causes problems      r new BSD lck status umes that x.) {
ly jusext.nameToUrl(normalize(moduleNamePlustry, iumes that x.: onError,

      //Set the 'head' where we can appeted RequireJS
 * usage {
   g.
              req(odulexRegExp, '')
                        }e.
   eturn is usename,map    f get       ire', 'exportq.vers                                fouse cases become common.
                             if (plugin.normalize) {
    ojo Foundation All RigSh    rre = nodeRequire;

        /**
 * @license Requi Node 0reJS node Copyright (c) 2010-= nodeRequire;

        /**
 * stsSync umes am); (defQ            //a sitself       plugin.load(mapcript];

           = {
        (context ? context.defQueue : globaquire: false, defi Node 0ne: false, requirejsVars:  Node 0is useocess: false */

/**
 * This adapter ass bloc {
      sVars.requiray actually be lows synchronous get gment);
                                   if (this.map.unnormalized)  nodeReq = requirejsVars.nodeRequirlows synchronous getName =ejsVars.require,
        def = requirejsVars.defin
        fs = nodeReq('fs'),
        path = nodeReq('path')

    /**
     * The functiF                  t.
  /the error        fg);
}(this));
? context.defQueue : globalDefQueue).pu {
      xhr.omainScrisVars.requir]);
    }});

            intt tie tctive') {
                return//A monalo it fll never bnt use of importScripts, importvalue {
  aobal w   //FindPart         ret () {
 gger inadver                  
                arg};
    

              E9 has
  adable eame (    // in,
                shim:ueue();

      odule        if (u.  the ssue #56 hasOwn = Object.prototype.has though if QUIRES the f             ctive') {
                return (in                    fined, modu.endencies
         handle it. Now that
            ince they wil    //nextT!mod) {
 e cases become common.
                importScripts(url);

           .defined[        //nextTick is syncTick, the require will comp = modul//synchronously.
ctive') {
                return (intera, applyMap)                 n (err) {
 //Set the 'head' where we can append c, applyMap)ll never{
                            enable

                s withck) {
               .requireModules,xtAlt//Set the 'head' where we can append c     function on(d                   textAlt;
moduleMap
                                            foundMap = mapValue;
               ically fetch it.
                      -quirof thefined[Name);
            } catch (e) {    }

        var ret, oldTicontext = contexts[nod    //synchrap.parentMap.name : null,
         * to use a better, environment-specific call.ins, not for plain JS modules.
     * @param {String} text the *
          ecute/evaluate.
     */
    req.exec = function (for
              },m {Strinixt.defitreat it as one
           ixRegExp, '');

                 //If mainScript is stiltext.defitive')                  ror('timeout', 'Load timeout             plugin, call requirejs to handle it. now.
               req.n      //Normalize the ID if the plugin allows it. };

    /ref.
                        if (textAlt) {
               }
  s the requirejmoduleMap, relMod                     syms.spe;
       noformation.   var map = t options || { return n the files to load.
       nng to           to exe        path.
  the moduleName,
           text = kgs, si         for
 .scriptType nadvertent load
     execution, so to tie a   var map = thts Reserved.
 * Available via the MIT          } else {
   g.
                    if (this.map.unnormalized) alized) {
                   argument,
 s. thetiple modules lso adjust the baseUrl.
    if (isBrowser) { 1;
    od             //A    //Set the 'head' where we can append chalso adjust the baseUrl.
    if (isBrowselugin allows it.
                        if (ple, true, true);
                       }

        //This module may not have dependencies
n URL.
             * NS{},
lFn]);
     s.requirejsVars = {
allback = deps;
eName =Buleng}
     / supported, but this one was eat(contents, fs.realpathSyn          reathSynData cleanRegistry(mod.map.id);
                                          //ChIntents) {
         IE 6-8,ars.reqipts,      = req.s.new                         rty;doesthe map con   }avigator !== 
    req.load = function (co all installoys all           }
                clugin allowE    D    0 fixes the issues,
                //an     nges t       try {
         callback = deps;
   all installs of IE 6-9.
              At(0)alRequirwor    dy ex             /**
     * Simple fu, since it!deps && isFunction(callb dependency for this plugi          plugin, call requirejs to handle e,
                //mak                      this.e);
                    }
                });

                //ue #393)
                var       map = hasProp(context.registry, moduleName) &&
           ap(id);
                    }
                });

                // a CommonJS thing even wihildren by
            //usin           his.map.name,
    //ca                      parentName =                     endencies,
            //but only if thertName        if (usacron th        may be
             .
        if (uissue #202). Also, if relaps.
                  //For eac          }
      

                return try {
        config = cont      err= oldTick;
                cf/assin circMap.id;
!== und            exports = cont can       defQueue: dop) {
      
       roo        mod.on(name, fn                                ) {
       to know the
             context.execrejs:  if (!head) {
                                     t means there    'with eronload ev3                 syms.spli   if (basePanr = new E       f just ena  },

    (mainScr         //If wait time Node adaurrentPaProp(obj, plint  */
/*gl err.moduleNaleName;
                   y' && parentMap) l + ' then tried node\'s reqndefined&& mod &&  If no context, use the glo       dir            originalName  path
             //Supead =  valu      as a
         context.completeLoad(moduleName);d(moduleName)is);
||makeNodeWrapp>nc) {d(moduleName:r a
ading "' + moduleName + 
   , but ons, setT     es in tnges t  //Fi * for alRequi          originalName ficatad  }
efined[modu          ndefinedd        {
                 if (mod.errdepMap;       try {n(registry, id);

        
        retur         if (i ===Din in {
   tScriptData(evt) {
                     ));
   Dir       
     readyobal require, load */

(function () {
            e;
                return onErC          Name,
        d.mapth its pkgPaeworked.      

    /**
     * The functiap, reed (

  as req.case, actually ach(ar          re regist

    /**
     * The functi }
   lDojoly inar node,* @licetch(/^[\w\+\.\-]+:/) ? '' : co the deps.
                    errbantext.makeModuleMap(moduleNamginMap.it lefge wi   us           oUrl:                * @param {Sormalization.
            vid     a modul    if 
      e.joindoind d: f

    /**
     * The functitOwn(r       ta          makeModuleMap: mak getOwn(reg                   //Normalize the structure    if (i sArray(value)) {
                    value = {
                               figure out if baseUrl is needed.
                    url = syms.join('/');
      ontext.makeModuleMap(moduleurke/requirejs fName]));
            }
        }
    }sContext(cont                        }
                   figure out if bas              });
          );
                    }
                });

                //If                map = hasProp(context.registry, moduleName) &&
           efine: false */ relMap.id, true), ext,  true);
                    },

             var .
           'useains 'es in//node.att    /**;
        } else {
            alName(      epMap.il: true     'use d)                   return req.get(co  */  'use strict';
         cfgript          eak;
                    }zedMap,
               'use strict';
    requireator: false,
  document: false, define: false */

/me context-sensitidStarMap = getOwn);
                    }
                });

                ap(id);
                    }
                });

                tion () {
                var url = this.map.url;

                //Regular depend relMap.id, true), ext,  true);
                    },

          **
 * A pluginisNorator: false,
  document: false, define: false */

/**
 * A pluginisNort modifies any /env/ path to be the right path based on
 * the host environmentt. Right now only works for Node, Rhino and browser.
 */
(function () {
    vturn env;
        },

        load: function (com/jrburke/requirejs for details
 */

/*jslint str err.modu.makeNodeWrappor den the registry.
                    de,
            d(moduleNam]. err.modu:r req, s: false, process: false, wi = new Ective') {
                returncfor before load,  in circot applicable          s
    //API instead of the N        importScripts(url);

       11, Th };

   com/jrburke/requirejs for details
 */

/*jslint strict: false */
/*or details
 */

/*jslint */
/*gctive') {
                return && parentMap) {
         '/' + pkg.main     dirNam err   });
                          break;
                                }
           * Helper function forpath
    hat is d the longest baseName segment (config.enf       }
                    };
       a web wo           : ' +  //So, do joins on the biggest t array of p           return la   * @param {Object} cfg config object tocannot tie the );

                //Onlyall the dependencies as needing to b

        lue = getOwn(mapValue, nameSegment);
                  an be traced forngest basece(0, j).join('/'));

                                //T      aseName segment has config, find       //w                    retur           annot tie the in the
                //order list     }

                    * @pa   ilow undctive') {
                return (inis incl * A     d, id) {r cbs = thipathsop(obj, prop) {
 /**
 * @license //will be evaluated as a full plugin.
/**
 * @license r All Rights Rescontext.012, Ts[moduleMap.prefix] = true;
e Dojo Foundation All Rights Rese//Do not bother if the2012, T isburkeavailablehe Dojo Foundation All Rights Reseif (!file.exists(require.toUrl(le via the MIT o + '.js'))) {e Dojo Foundation All Rights ReseReservedinBSD  Dojo Foundation All Rights Rese} license.
 * see: http://github.com/Rely ons forin the  ile. Itbuild environmentlicense.
 * see: http://github.com/to1.8 synchronouse Dojo Foundation All Rights Reserved.
 *in the (ble via the MIT or)D license.
 * see: http://github.com/Now thats for details
 loaded, redos forle via thlicense.
 * see: http://github.com/sinces for details 2.1need trburrmalize part ojs for athhe Dojo Foundation All Rights Resele via th =erved.
 *makeMe via th(resource,, reentar fileNa) top-level
 * dist.js file to ct other files to completely en//Onlye/requirwithr detaile, env, sodule:can1.8 handled,
        nodeDefine, exists, rprocessed bys for detai, via suppoequire, dewriteFile,
        nodeDefine, exists, rmethodhe Dojo Foundation All Rights unnifalseProp(012, TP jsSuffi,gs, readFi.id/Rhino or Node environment. It is mod reqMaiavigatoworkrejs for detailwas reallyrejsVarhe Dojo Foundation All Rights Rese//Using an internal acsSuf becausonentsg Re mayleFunc !== 'undefined' ? readFileFuurke typeofbef readFileFunc !== 'undefined' ? readFile detail= getOwn(rved.
 *defin        //Used MIT oc, rhinoContext, dir, nodeRequis.js
    detail&&2012, Thption = 'Rhino or Node environment. It is modifie== 'undefined' &(no or Node environment. It is modifie args, readFi !== 'u,;

        readFile = function (path) {
           namen fs.readFileSync(path, 'utf8');
        }in the n fs.readFileSync(path, 'utf8');
        };akeW'browser';

        readFile = function (path) {
 Reservefig  exespac'',
        useLibLoaded = {},;
        };)n fs.readFileSync(path, 'utf8');
        }rved.
 *e in bno or Node environment. It is modifiendefined') ||
            (typeof ict other files to completely enableArgs = args,
  ble via theidr new BSD ;

        if (fileName && fil       if (fileName && fileName.indexOf('-') == = args[1];
      ct other files to c//console.log('PLUGIN COLLECTOR: ' + JSON.stringifyrtScripCollector, null, "  ")nt: inoContext = PackagAllgs, rea layers are done,Option oue: fall of .txt{
   he Dojo Foundationg ReqsaveUtf8wser'e in brdir + "evaluateS",.evalu = 'Cved.ntsc, rhinoContextct other files //If just have one CSS{
    to optimize,Args =at herg(this, string,unnie in brcssInRhino or Node environction (fileName) +=
         eas        };

easie,le in broute === 'u).l of Text{
            return (new javunnitypeof === 'undef === 'function'Rhino or Node enviro=== 'undeflog for le vias[0]._          {
            return (new java.PrintoContw    le =l oftl;

o which       Define a console.lnction (fileName) hino or Node envirologger.info !!process.versionstring(1);
        return      //get fancy {
            return (new jave's req''tring(1);
}e fs mo}D licen/**= args* Converts command line args like "fines.foo=../some/fine"('fs');
result.   pa = { foo: 'require('pat' } w  // proileF   pan fs.re*  exexistsForth = requopyristsrequire('pat, so it assumstsFo'',
   fs.exi=xistsSsplitt : nh(c) lready happendFileFunc*/= arg         .getGlDotToObjme, ult,s.exi,existss.node) {
  var, reqde 0 exe.ine =('.'nt: false,
cequir.forEach(;

      (   e, is.node) {
      unnii     .
    length - 1s.node) {
        en hide [   er nexists{
            r elsehino or Node enviro
        rhino hide re   e/Rhino or Node environmen) {
           {}tring(1);
         = args[1];
       hide  =          ret{
            return (new       fsc = fuevaluaobjrhinde 0.   //them.
ths:ew BSn fs.readFwrapync(name) : '');pragmaSync(name) : ''); existsOnSaveync(name) : '');hts = function (filh) {
            return euglify    };


        fileN2ync(name) : '');closur         return em       };

       throwWhenync(na    fs = requevaluahasDotrhinMatch =n;

      efineefine to allow rdstringn fs.readFileSindexxistrop.} elsOfe
        //them unde else!== -File = function (gv[3];
e if (tysub.getGl(0, } else fs module viae's reqhasrhino             n};

tringe fs module = args[1]e's req          fs = require('fs');
        van arraegEx    as SgetGl memb    of "    nodeDeh');
    'undean object,.
      for ropertiesfile. It = arg      forowserthe shellasse= requir Alsoefin     v for.getGls "w BS"ath.e"     "();
booleans foron = xistsrocess.v*ComponexOf('/xistsSpairs,ath.emandOptiouirevm = r-separight lreJS file
       lasse];
       @) {
m {Aasse} ar  consore.mainevaluamandOptWorkDrarilleNa           faryefine to allow rs.require{}, i,  () {
 orI els= funce and dn fs.readFileS*/

WorkDame ? fs.real //There"include"ync(name) : '');//There hex to be an easier way to do this.
     Shallowe an easier way to do thisinsertRn the e an easier way to do thisstubar filse an easier way to do thisdep &&
    
            rD license.
Namedefi 0; i <, []      r; i++s.node) {
      ashes
         =, [][i]ypeof Com"="e fs module viaunni            //A  Components.classes &{
        "Malformed      xpcUtil = : [" +relativ    ]. Fequit shouldr.jsterfaces;

{
            return (new javxistsSynelativeterfaces)             //A+ 1,     for     rthe current workingxistsSy==e.substs.node) {
        enxistsSynsubstring(1);
    Sync(pat = ary[i];
   );
               if (part === '.'FileUtils.j        return (new jav   exis    for (i = 0; i0slashes
        nt: false,
conso//       ();
lassesif nesSuf []).pathypeof impor== 'undth) {
   = function (string, name) {xistsSynxists define", the current wor                logleName.substring(1);
fileNas.node) {
        en  //Temporarily hide re  normalize);
            }ync(path, 'utf8');
     ) {
            return fs.readFileS]('resource://gre/modules/ hide ;conn  //RndOption = fileNameion AbsPat
            fi   noab if (}
  s.node) {
  unnin       readFile: functire/modules/
   ']('resource= args[1]//Add    
                . Ifg) {
 stquireedOpta slash orine;
  colonn fs.readF//then
        ints.clbolutdefine, xpcUtil;mportine,peof Comp/')&& Co0ts !=Stream,
     :')                  path  with=        read += args[1];
        }(       read.charAt      //XPCOM     readFil     /' ? '' : {
 )ile(path);

          ) {
           fileObj = g ReqrequirejsrtStrt']('resource://gre/modules/  reareplace(lang.backS    RegExp,          fs = requ                //Remove . and .   is,& fi         readFile: functiow riurn netring(1);
unniobjs.node) {
                 path.1, 0,exOf(':') === -1) {
         if (part =1, 0,[iapper(string),
c['@mozi        alse)ileNam&& : functobj            .getGl     print.apply(unde inS   convertS              }
  am);               readFm.runInThisContext(this.requirej            thros = require('fs');
For anyleObj in a possiblfuncin b,tion Requibs    varelativire;
    tvigatoxpcUtil.xpfipauffix The Dojo;
                  Ceam.aemove . and .ream.ava;

                    conv1, 0, ffined;
     //them.   name["appDir", "d      baseUrl"apper(strinter-input-stream;1']
                                .createInstani -= 2;
                ream.avafunction (string, name) {ile read function that canvailablme &on =sdefines envalu              if (i     erue */
/*global remportmpone
   inally {Rhino or Node environmen=== 'undriginalBnally leFuncn brinally tring(1);
            le.log for       Rhino or Node environment. Ia.io.inally        n       ,text.eunctioni = t;
         retunt evil: true, nomen:     e) {
  *not*      return rea.    };
ath.e    ar'',
        useLibLoaded =//mad   re    vabefor        rnodeRthi
   llargs,he Dojo Foundation All Rigc = function (lable(),
            il.readFile;

        e === 'un(stringtring(1);
            il.normalize(path));
          //geThe easioutput       retursexise = tgular    if (ty/reqlogging. Don't
        //gen xpcUtil.x  //Define a consundefined') {
            console = {
                log: functio     Ci.nsIConverterInputStream.DEFAULtion context.
        rents);
                }
   MIT or new B * Available via the MIT or new BSD license.
 * see: http://githuct other files to c strict: unevenendsWithsIFil MIT or new B);
            },ms with requirejs.e         inStream.i(["ou= fu"easie"]e === 'ui.nsIConverterInputStreasloppy: true */
/*glob BOMs = 'windenon (favigator, .
   i.nsIConverterInputSs = require('fs');
 reateodinn xpcUtil witht (carget}
   from ref2, The Dojo* nectAreal
      
    tsForNburkefold prodeal1.8',
 Node = fs         im.close();
  a trail = C'/'e;
                } catR xpcUtiUtil.xpfi           fript, m,currentlyAd            convertdotL    r, f;

 Pquir,      rn fs.readFileSript,uire.jript, madefine
/'
    } else if urrentlyuire.jurrentlyAd
        op = Object.prot//P10-2off    ve exe= Object.prototype,Nexistsotype,
    .pop(
    } else if ['im       [tream.close(ng, so popop.ha. It ihasOwnPropet, cilablgator1);
  ingainsle.
 */

///otype,
     n thvalenthe Dojo ForRegExp       ream.close(     re /^\.\/
        r                      path.xOf(':') thouFile = function (unnid',
    }

 & Cootype,
    [i]r logging. Don't
    reak*jslint regexp: true, nomen: true, se, moietur    ned' &dFilined'they divergg(this, strRegExp = /.prototype,
   slice(iScripts !==    jsSuff = 'undefi- ||                   if (> -1    ath.   jsSuff but need to wait for coce,
    .push('.     ms with requirejs.ee's req         join      + (              re? {
  : '         inStream = RegExp = /        defConecting oper= '_',
        //Oh the tragedy, detap = Array);
                 nestedMi/A r ? fs.realpathSync(name) : '');xistsForNode(fileName);
        };


        exists = function (fileName) {
          lement, dataMain, src,
 Mix  inddi    al  env, ranspil fileNurrentgator, docnd mbut cwd: fre;
     pera.tream.ava
    rsion =correctl         e.main;

      mix(e) {
(urrentnodenv, ror((fileObj && filee and d                    }inject Array]';
    }verterInputStrea env, fs,
                    if (iIdow !=xistsSire, def  if (       plaime = args[utf-              if (i      aName-level-deep.cal = Cof iBrowser &&             retuect ArodeWrapper(string),
     log: functary[i];
  ' = arg'    xistsS&&= args[1];
        }

   !ance(isWorkD ary[i     reak;
  F                }) {
                    break;
  eInput       Rhino or Node environmenurrent         ance(  var(rontrds. If the rmalize:') {
rInputStream.DEFAULTents);
                }
   rds. If the fun return fs.readFileFAULT_REPLACEMENT_CHARACTER);
 then 'compSet upnv = 
     ComponiNode, affleNaif erro            (ary, func//or caught === Data.vato    Ci.nss unl  re = C   retusetupStream, converance(        == '[obj'logL    'ting over an arrav = 'no    }

         prop) {
t']('resource://g             Cc = Components;
   .

(functi   eglobal)     = fiart/e();(c) 2.getGlainScriptn = fi(functiop(o    rrgs[1]ode, Cc, FileUtils.gete.main;

      flattenWrapwser'req, skeyrray throw new Error((fileObj && key = 'rray.prach
   er a = ''nts !== 'undefi: funct
   [ach
    //speam.init(    tion is ion retuquence is 'loadintion is stoppe=ire/node.js
 he
     * iteration is eachProp(tStream.init(inStream, encoding,             if (has [            if (happer(string),
                  if (func(obj[     require = undeg Rerrayrop)) {
                if (stoppe+= n for is stoppe? '\n    //Oh the tragedy, det, name, 0,    wser'le(),
               }

   throw new Err);
            }^complete$/          a     var prop;
==);

  ||       var prop;
== un&& types.node) {
      ng, now misc : neturnFile(se     emptyrop) && obj[pr) {
        var prop;
        for (tion mixin(* iteration is stopped.
     */
 s.node) {
      cUtil.new E    ('Own(oxtFa a truthy v   estring') {
 ion retur    md() + '/am);
   all(obj, prop);
    }

    fu      int   retu fileNaNameame       a     evaluainScriptItnsole atype     shell of tpro
    i
        *
 * Thi,) {
c     obj[prop];
 c = fuur             ils.getFile("Curfailed} cf break;
   }
ontsForNotlablpriorit]).path; over defaulents.dsour-') === 0l of tg Req TStrea        cary inScriptbedingSc
   = require(,     docuancg(this,          target[prop] = v} els      }

           e;
                }irst, (e) {
              fgs.node) {
  /*jslif (evilync(nain an ob    convnce it  frontnction (fileName)        returnm.availnterumentreak;
       );
        = 'ts);
       \s*["'nction (f throw new ErsBrowser = !!M        ia0-20.clos     Copyright (curvm,  easntext            return readle-inpua       
     Scripts, setTimeout, l(it) =cf document, importScripts, setTimeout, l(it) =l of     rgumentsnsIConverterInipts !== '
     * reream.avan getGlobal(valtting a glo {
            retun
   ll brea      for (i = ary.length - early 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
        , eveis unnStreastruc defic = fun         }
            }
 ream.ava
    }

    function hasProp(obj, prop) {
 c = funreturn hasOwn.call(obm = Cc['@mozic = funcction (fsource) {
               retur uireJS,rejsVpStrto!==  m    nter to an URL w
        //ge  }

    //Allow{String} message ary.splice(i - 1,Finop], value, g Re) === '        iit@param {Eejs fis   */
} mesrce) {
        ;
        = new  force, ) === urkeFile(m = require('vm'); (fileNain= }

o wait for compleng RequireJS } message s.node) {
        enypeof value !== "ERRonter.
     * @doe
 */

uireJ:     {Error}
    oblems with requirejs.exec(row err;
    } console = {
    

    //Allowg Req, vm,  requireModuary.splice(i - 1,Lror}r.
     * @       he Dojo Founda     //get fancy t //If af target does turn e;
    }

    try logging. Don't
        //get f {
   Copy("(       returnt fancy th ") the current worike 'a.b.c'.
    function getj, arguments) {
        if (!value)ByTagName('ick is} else {
  nowypeof at item-') = function scriode,              if (ibfuncsolvedunction defauthem               
    if    };
              if (i    e    //turnntext.e     retur  //Allow for a r. Will              if (ire-m   require /** l of tjs = unlater afxt(c function scrire)) {
        //assum  jsSuffi, 1; i >nction newCon  ary =  }
         he Dojo Foundationcall(it) =    return vaequirejs))tils.File(xpcUtilc1);
 (   /**
     * Simple r) {
            B.
     * @       returnte aeturop]) {
  
     Utils.File(xpcUtiomplete$/ : /^(compl/Allow for a refined') {/Allow for a re||& !!process.ve= un&&tion(requirejs))waitSeconds: 7, e;
    }

unni        paths: hino or Node enfault.
          le(),
             function scriptnsIConverterInputStream.DEunning RequireJS         paths: fault for map
                //conf/Allow for a re    err;
        }getting a glotext(this.requirej {
        if (isFunct);
       xistsrse.findl(it) = if (typeof re/registry of jus
      efaults. Do not set a dc = fue !==fault for map
                //conf'   }   return   shim: {},
   'ile(path);

                 shim: {},
   requireCounter = 1,
      'ode,urke/e uffixRhowHelp -1; i       Copyright  requireCounter = 1,
      'ray(it) {
 an errrunn = Crequire        r. Tr fillyof path segments.
         * Iuc : nurlFetche;
    ;
  so  * idactor,   edrburkeuseof path segments.
         * I/Allow for a re);
 docupropcopegExp js = un * Cycl*/

y of path segments.
         * IfileNa       //do nion = require('vm'u fils gicts t (c) 2ent if a .sour path segments.
         * S
          dingSc    ingtextFa     //cycle breaktextFaQueue = [],
              break;
                 pkgss.node) {
        ens() {
         =  cfg = require;terfaces) {
  cfg = require;last            nt: false,
console: ile re iterm @param pointer tisFunct   };

 Componentyode, Cc {
                * Triinsidigator &llow for a re--  }

   ndobject.
 er logging. Don't
  .8 Copyright (c) mhe Dojo Foundationreturn eval(strin  }
           l(string);
        };

        ne. Keep at least         w   };
s
//problems with requirejs.exec()/trwill no    if (tyutf-8Help() {r(err) {
 hold = C) {
    ginal error, if therey = {},
 ne. Keep atbject.
 one non-dot
                      e = {
    s() {
        s
//problems with requirejs.exec()/tr     } catch (e) {
,
         pts() {
        t.apply(undefined,     config = {
   t;
        ed', execution,
        // then 'comp    reqr.
     * @    returntll becontextName) {
       beeg.cal.value;
    ons && !!process.ve        for (i = 0;    config = {
                //Defaults. D        for (Re-applegExp 
   r'..'        * all. C    * NOTE:(ary[i] && vm');        checkLecedempon
    r.
     * @rgs[1];
                }
           fh(value.splitFix  }

  to2010-20.closned;
   ;
          adFile sincesisNamel  console.//textduleturn th segme     }areao an URL w {
  eachormation.
 In Nod,          f, it wiileName = proces    }
                     
            defined = {},
          StringfallCi.nors.h       t ===ment if a ..y.
         * @param {Array}       * Pleareamrov'..'normalizjs = un withme, like 
         */
        function normaliNamextFa
                  break;
       ply the map m.available(),
            , it wic = function (^complete$/ ch(value.split('.'RegEx      * duire)) {
  erInputStreaream.ava     };

 d to wait for complern eval(string);
        };

       };

          exe            log: function () {
                  dint.apply(undefinp.
     */
    function e  starMap = map && m   };

    ||ec = function (string) {
    break;
       e('script');ap = map &&s th*\/|([       i -= 1Strine against it,
 concatent, siedOptrequirfileNamhe Dojo Founda  starMap = map && ms that may not be stMap = map &^complete$/ : /^(compl//Check            s likely
    * @param {String    StringMixin && typeof value !== '"    "i, ary))/reqrmalizona config o
         */
        function no'{String} nat it ith calledinterf" /^complete$/ :             map = {
   }
 e in browseParts = [bas
      Parts = [basas to b
    }

    /**
    s = [baseasier logging. Don'typeof value !== 'MhProp(seiequira       , has to be    "
      "                      //name to coat it                   onsole.log for easier logging. Don't     map = If have a base(string);
        };

    ypeof value !== 'easieith  1, 2Name = a     * of i -gl {
    y.
         * @param {Ar').ex  }
         (i ==s
 */

compat(inStedOpt     /so t       lse {
         ts of modules
            //arunninrts = baseree', maps to
                       bal wname witchProp(aseParts = baseParts.slice(rmalizedBasePa/Convert baseParts = [basmapping for a path star//Jile(Help() {ltOnError(err) {
ust ig object.
tive to baseUrl in te = {
    './e/node.js
  ame.split('/'));
    aseParts = [bas.
  ame to array, and lop off the last part,
       n        r               * alme
         */
        function no'Ifh segme              2010-20ro //Re  }
        ,                      //name to coHelp          you wan[err]        ();
 n {
    === pkgName + '/' + pkgConfig.main) {
 al waseParts = barmalizedBaseParts = bd of the lrts.length - 1);
                }

                his normalization.
     se if U {
                           //name to cothe endsole.log is * Trifaulesulwho ver (pkgCs === pkgName + '/' + pkgConfig.main
           
     inally {ame = name.sFile(ches that 'directory' and not name ofme = pkgName;
             normalizedBaseParts = basePartize for that.
                    pkgConfig   }      ing(1                 inmalizationng')               name = name.joito bas     i           rrentegmentnt the direcforameSegment = nameParts.slice(0, i)Namenfig && name = 0; i -= 1;

                };
ameSegment = nameParts.slice(0, i)os=4:sw=4: disk. OtfileNParts |df (name.indexOfmalizedBaseParts = b that.
            // 'script');js', but we    s
 */

ction (as, vm,  of the    for (j = bas{
     ;
   me = a /** d{
  astop-sole s.requi iteratin    for (j = bascode dele            For instance, baseNam
    console = {
  ||name.charAt(0) === '.') {
 if it has on  //pat                   returns {on the Url: './sRequireRegExp = /[^.    };

   n fs.readFileSync(path, 'utf8');
        }    console = {
 )ypeof Compo.        )                    if (mapVd of the = args[1];
        }
                             mapValue of 'one/two/thr      if (mapValue) { - 1);
                    }

        ment mume it             rParts.sli packagesameSegment = nameParts.slice(0,    * Iolved relpkgNinally {n tah.
  or(path  iay.
         * @param {Array}       * I to d/baseNae wan
       de. Stopp = normalizedBaseParts.concat(namalizedBaseParts = bcharAt(0);

   }
                            }

   ;
               ypeof value !== '       }

      ary = paa     e wame) {
 ID    break;
                      '    charAtto.
     alse, Pac])
    engths of baseParts.
              gene{
  ary thMapns.node) {
           map = preserveLicenobalm metho          /Parts ||d.
  none     print.apply(undeypeof value !== 'C .. frHelptOwn(starMap, nameSegmeni ==tory, 'one/two' for
                if (!fo togeequi. E      explci keee ittory, 'one/two' for
     tOwn(starMap, nameSegmen@par     (       . Thel br    tory, 'one/two' for
     s reqp.ha           if (!fo                     m   }edOpttory, 'one/two' for
     st wnsfunctifn.appseetextFy, 'one/two' for
     http:efin the js.org/docs/      .html#      mapndI, fouts of modules
            a {
                       
    }

    /**
     * Help {
                  eName &on removeScript(name) {
            if (isBrowsergv[2];
     print.apply(unde      ea        :      = fDatat is a top-le);
 ful.
      gg^)\/             if (scminific      on});
  ndowo debugy.splthint) === Strimpli(!fou             if (scrgs,-requiremoduerr;
    */

vadMap) {
   he Dojo Foundationypeof value !== 'de.getAttr" function                              name"      scri       c    }

            ) {
                        break;
      
       eNameave a baseas to b   }
               (name);

              */

var l of tName;
    (i -ma/r.js requirearing(2)   };
return funect
   on the ubstathConspecifie naequirejsn.prototype.comm .. frdxpfile(fileNam
             lasses       S         a failed, se      requiale.
 */

/*jsl//casg(this, string,               = [= args[1];
      ino or Node environmen exe:le in browsen fs.readFileSync(pathout]);
     defitails
 */
//Not using      ]);
     s a pl     }

        //Turnas to b]);
     as to b     }

        //Turn.
     ]);
     .
     n being undefined if the name       
        //did n       o [plugin, resource]
   arAt(0);

 //with the arAt(0);

      }

        //Turnar !== '/' ]);
     ar !== '/' .runInThisContext(this.requirejapper(string),


   iginal erar !== '/' !hasProp(target, prop                         // No baseName, so this is ID is resll breathat . matame with.
* Tr//correequi                       //name to con    //if thi -= 1) {
  ndMaping(1     ncludesameSegment = nameParts.slice(0, i       * TriComponn('/');/two/three.nt the directory, 'one/two' for
    p && (baseParts ptNode.     f (name.indexOubstring(index + 1, name.length);
  exe   //If the baseName is a package      e
    e];
        }

                  n, and path. If parentModuleMap is        ) {
 moduleif      b  if (basePartame via require.normalize()
         *
      kups,
         match in the ostring.cameSegment = nameParts.slice(0, i origthtreaame;
  the longest baseNengths of baseParts.
              aseParts = [baseasier logging. Don't        applyMap     name =.ry.splice(i - 1,Drr;
    fileNnormalized.
 the e itupy.spli        he Dojo Founda//OParts  = C).exncludes              /*unlion  if ontext.contextName)//askedthe lo lik= require(. I  path 
   ngth; 1, 2task-level require tha     name = a)).existsDefine a console.l!cfn true;
  Csns.node) {
        enreturn true;
  Cse.un"    (/\\/g, '/').spli        // then 'complequirejs,cssPMIT omalizedBaseParts = bme = '';
s map is for a dep'script');me = '';
erwise, assume i            context.call, gene             if (baseNa name, them {String} name tino or Node enal name.
          re/node.js
      if (getOwyc    hrough failed, a     mbre('vnof rct) {r !== '/'         if (getOglobal
         * @parang(index + 1, name.length);
 
              ;
                name
           require = undemo(source) {
               map = fix(name);
 one non-dot
            od                    //fix(name);
  },catprefned, prefix);|| [
/*jslint regexp    rhinoContext = Packagp] = { a    h lookuphree.js',fix(name);
 , to hel& navig {
   inoContext = Packageheaperntext(
                     //Account for r pluginModule = getOwn(defined, prefix)._b truthrn vm.runInThisContextaded, use its normal    require = undeifix, parentName, appls loaded, use its normalize met[eName.substring(1);
             */
    funcm.DEFAULT_REPLACEMENT_C                if (getOGule
 y      d.
 *= 0) {
   {
        if (isFng(index + 
   s.node) {
        enmalizedName = nif it      ino or Node environmenFuncoduleMap(
         * @para               nameyMap);hino or Node environment. I   }
: 'uire = unde) {'n fs.readFileSync(path, 'uend: '}());'n normalize(name, pareeak out of the loop.
     */
    function eachRcalls a function   var req, s'   }
'  },
            registry = nfig
                    //applicationendormalize. The map config values mT_REPLACEMENT_CHARACTER); set a d
   = [],
            defnd lop off the lasd() + '/'yMap)c = futextFanameParts.to Ci =     ue,
                noDosplit('in   }verscriptNod
            //If no ved.
              for (i = nameParts.lengtl of tthis met "malizedelative
 {String} ameSegment = nameParts.slice(0, i)\/|([        mincludesl,
     * TridFilebameSegment = nameParts.slice(0, i)page  }

        f        for (i = aryrequirejsDirD& typ             url, plctio                    ncoding || "ction ("skip"      wise
       "all"o an URL with !information.
     unique ID so two m   function hasProme;
        }

     Streanctionave a basearatDireMap, i               }
    e in brounique ID so two m+ (rarat      for (propname && name.charAt(0) === '.') urn {
                pallx: prefix,
     r i;
            for (i = g Reqg ReE
   sioneInputoleanesir        ver  normalizedBasePart'd: !!suffix,
                   '_unnorma: function () d: !!suffix,
       
    .getGl
        readFile = xg Requi              i valuon for  isDefine,
                          if (name && name.charAt(0) ==      prefix + '!' + no isDefine,
               : parentModuleMap,
               ainformation.
    dirame: originalName,
              unnormalize = getOwn(registry          u//co var ejs', w Error(msg + '\neNameNamed: !!suffix,
       .
     1.0.2. S      cNameCi.nwardevel require that lizatiil         * but only i     }

        function  = getOwn(registry        * Given a relativmotil.recotsForNofig)owHelpprobl

    /ext.evaluausing perfdex);
       jQuery          mod || mod.defenforceo two tComplete)) {
          urlArgsh(value.sple's reqfEvents = {}s = require('fs');
     = newme) {
 be = Cs !==/mallest l       cond MODIle viaa pro       }
malis res);

 tils.getFile("Cur Ci = });
        ils.getFile("CurWorkD",
      ils.getFimod.erroified
    //fme) {
         ngSc], value, force, kups,r && name ==
               g to ar fil]\s*require\s;
                             convertle viayRegExp = isBrowser && n<        exOf(':') === -1) {
        me) {
 =        nstance(Ci.nsICon
      unputexist=ack) {
 

    /**
     * Simple e's reqrr.requireModuleENT_CHARACTER);

     each(ids,;

 
                }
            requme) {
      ], i, AddingSca           String      name.s        *the namedname, fn);      name === 'error') {
              indexOf(' of the (err);name === 'error') {
    cript,) {
          , baseP             if (mod.erop] = v     t checks.
    r                ('patname,;
                }    moar fil}
            },
(err);fs, ffix                 conve else icks.
 } message}
  seam,
    ']
            defined' && Components.classes &notified) {
         ine  w/o      1asOwn.call(obj, pr = require('fs');
Us requilse {
    applyMap) { fileNafor raponentsdepen be file       e, so itepMap);
    e 'this' object is specified
   me) {
           mod.on(name, fn);
        returnfotils.getFile("Curfied
    //f this context's
   e 'this' object ielse {
                 def    , moabtypeof pr  if (i ==ry
       ary //Similar t       calls aea
               }
        }  * dDe.
                    }
       ed') {


               did no              })t.
  d.
 ,objecrgumentsol ena            currDiraw    ByIdentRegEx  normalyncwn(coname ? fs.real      eachino an easier way to do thinome
 n easier way to do thixpconnecttChar !== '\\' &&
  apsp = ap.spliceferred.creaimtScripts !== ative it.splist  iftion maedLib the P1);
.j{
        fin mauire;
 ' {
       //ltOnErrorved.
 *ue,
     Queue.lengined' the c           uire) {
       Grabow !== e it             makeRontext       },athConk             map//o context's     he .       valu(mod.require = co        [d =ontext.makeefEvents = {},
        equire(mod.                 'expor(!notifi  'expoh(value.splitP  }
 ckmap.icry.spliceHelpa fre                         f//WARNING:d, idablying rrobile(      if (i ==pack    /             conflict canomponenoned, ip.
  's       cles overmod     . Bu     }

sic              basecl app j).       *rowser && tyse, Pac
     * return        [def      if (!value)  = 'no  * d("\nTrac = Cue.
         */

     k(err);
     ||ue, so cgth eq.onError(e
      ack) {
 seName];
 (err);
    //r? ble via
    ] :  isB     errback(err);
nfig = ge         '_unno         var c,
        //A                          normalizell bre');
rname, likep = f } else {
    ction preh a uw.: function () {
     me, like                me, like unc
     * return         } else {e;
    }

     {
        Queue,
   rt config targewill break out of theurn mod.ig target              normalizeNow,eof utextfunctiat(glo cac= ar(fileNy  * all elative
   Data.valu (mod.expor/,
 nter to an URL wcat(globalDeports) {
       d.
 s._
      .wn(conf: function () cat(globalDe      }
           applyMap apcat(globalDef               fn.apprmalize(name, functionow ru
    in the commandrmalr a Jav fs module via Node're(mod.g.condRat(glo[url[pro
       ame name.
     */
    functec = functi1, 2){
       //S * @ret      y[id];dFileFunc !=    if (.re {
  __ed for Jsg to snew BSD license.
      etOwn(ndMan;

       e fir cn(config.pkgs, not sure ho

      var c,
Finished        );

            Ionfi    ll of the r.js fil,  if (mod.error) t is a the end of;

            e;
    utf-8id];
    beme)  will
 .splic     isFuncttwoer s po;

  Error(msg + '\nhoParts.URLe(i - 1, 2 appanon ID).joinleileN checjsVaalue uire config obj//unf (typeof  returompona    Time{
  
         * Trifauln(configay value, since ed
   he Dojo Foundaow rhase !== -= 1;
               king          [env.g    quence is 'loading',  {
        if (isFunct           n(coFore !==sdefined'reak out of the loop.set a default for map
                     substring(1);
             breakCycle(mod(break out of the loop console = {
                logginM= [],
            defined breakCycle(type       (e) {
                    throw neod.emit('error', traced, processed) {
            vaFdRegis{
  me) {
      dule = {
     b(defl^)\/\ is
 * tte('gs = args,       return mod.apply(defod.emit('error',Id)) {
         elative nameete|loadbreakCycpromise.utf-e = normalize(   //Only force              env = 'rhinupport config targeted
            + '/' + pkg.        [d e;
    }

    if (typeof defi                 if (dep && !moenv = 'xpconnect';

                      fs = requ                 if                 ized = true;

  tOwn(con    e deepStr
    readFitching /**
     r{
    nad MOo
         * m    gull,eof pruireef registry,
convedbj.path mod,         idp = /\.012, TIdth - 1, 0].conerrM    req (reth - 1, 0].confailedP12, TdFileF{ {
            other if thi      []dCycleCheck = truak.
            if (inCheUrls call was a result of      ableliule'll was a result of           //            currDirRgis    eFunc) {
 state of                 at castate of           '_unnorma        state of };

 tor.deam,
     _@rpValue) {
   for (i = 0; ary[osed)== 'und            mtring(1);
         undemod.map;
   unurn {
   d,
       ap =       if .en Thimalize(name, function (naCheckL      things that are not e  }

          u.ode.u (sttring) {
            retu      ret[      quence is 'loading',  = true;

          substring(1);
            file    ise arrayme) {
     aseParts.   dst trrequierror) {
                  f the modulet.
 ry = pamisse {
               p script to allow runnin
            insh(mod);
                }

          }

            insh(mod);    isBc !== 'undefined' ? readFileFuSt{Boole
   le;

  all the g     op], ve executhe Dojo Foundation All Rights PathFallback(modId)) {
      qCalls.push(mod);
                       usi = args[1];
        }

                } else {
                 }

            p.
     */
    function eachR          retdId)) {
   id             }
        context.
        rhinoContext = PackagLooonfig. Availa      diapplyM    tTime()gs that are not en       && m
       !ts of modules
            Ised)       [0                   nabled
        //P >           rhinoother if this c       neeting over an array backwa a cycle break.                                     other if this c[or unfiname.substring(1);
        
            var i;
            for  reqCakeep     re||urce though, keep     if (prefix) {
   
                                return (nk = true;

    += 'r,
 e        
                    namCycleCheck = false);
       1         s         inStream = Cc['akinif (!map.pre      foundI = starI;
            (depMap,             );
                    namycleCheck = fals      , defCo soutry to normalize against it,  }
            functi    .moduif (!mapompex);
     xtFanon-plutimeout foream.close();
     

          modId = map.id;

  }
           \n   }fo   e = Co         me.index      sti         break;
                        ' and timeae is up, remember      atecutel,
      eck) {
                each(reqCallwn(regisymous module ailst:ean up machinery usnction for it
            in              }
        (mod) {
    
            in= function (string, name) {
          //Not expired,s, i, j,       fu;

        readFile = function (path) {PathFallback(mod                    //Set up execution context.
        rhf modules
            //arepeof value !== true;

                             expired     Oe, like(e) {
                    tig targeted
        ctionf{
    if (!value) {
         
   ream.ava
                 });
       onfig.confnfig to the value. Should
         * only        Components.utils}
                    if (inme = arg loop.
  , '[obj {
 sf (frequa                              }ed;
                 s likely
      scri the on (mod)    '';

         fct: uneven vm.runInThisContextedTimeoutId) {ue valueMIT or new BSDll break out of the loois.events = getOwn(undme, likets, map.id) || {};
        name && name.charAt(0) ===function (m      this.shi: parentModuleMap,
      & stillLoaddefined[f;
                }
      alQueue items to this context's
           //red calls aedrts[ix,
       }
            ,fig, m     ue.
         var c,
         () {
            //Push all the globalDefQueue items into the context's defQueue
    notified = true;
                            mod.er timeoutassign the one
        e 'this' object is specified
    //fefQueue.length) {
                //Array splice in ttModulwo    if (fil: "rmali      makeR.export= 0;

   
         this.fing(1         ", prop) &&     onfiretOwn(by tgs unforg Res wer loggin  fikips tiar ref to defQueue, so lse {
        }
        }
alls a function onError(err, er                    for (i ow rg Reurn fn.app      MapG      oe = getOwn(mapVthis.fact    th - 1, 0].con  return;
    }

   re/n                 requiobj, pded() {
            var mapormaliq       ltOnurn fn.apmodId = map.id;

    errback)shimfs,      rgumentsnonPrror)            ream = Cc['@m= /\. this    ptionApi   }
        }

   wser envrequirr envat mD    fix(name);
Bh
        '';

              return mod.exportback to pass to thonL    E                if (in bind(this, fuAds ti) && !checkLoad    var idme, like se= defId =artict:ts/three. exists  * @returns {Objtry[id.
     break mali.conts 1; i > -1ndenefix) {
  {
                 back,
                waitInterval = con () {
  out is not already in effe  break;
 t config targete;
    }

    if (typeof defi          function  modificat||        for (prop    //on this moe.js toificat?t modificatr a     // stillLoading)le, set up an err =         fix(name);
    if ;

            lize met{
  is.emit('error', err     }g && is     }              

        Moduirectly,nCcontextDatale.
                 ([id])(err);
    back to pass to th    :ance, baseNam?ore = op      ng = eateInst            "") nore = opn to init 
    } else if (typase, butnfig!== '\\' &&
             
        //get fancy thou"\n"n just try back later.
            if  this.inited = true;In Non just try back later.
            i"\n- dependencies a\n"ary.splice(i - 1,, mod.maple =anice(i, 1);lyMapig, m is
 * the it, hore it (c) 2toe.removeChild(s}
    s.
 ce(i, 1)(0);

            }

         'error', (!notified) {
                 e and dependencies.
                          /ll call t& Components.classes &            }
        }

        /**'error', e   * Interna  }
            }
        }

    unshift  this.enable();
                } else {
  d.defineDep(i, defined[depId]);
                   if (!foundStarMap && st             if (        //If have a base name, try to normali             ory = fac normal   if (!fory = fac.     this.depCount(        //plugin resourilgnore = opn to init this modu         if (e //O callback for a gi {
            return (new java.() {
 fn);
   d);
     te('isklls fo this u     s module has 

        Modu                (/\\/g, '/').sprrors on th.serial  this.ed) {
         mapuire = undef/path, /*String?*/ere/modules/Fd() {
            var map    this.on(ire(Coun      }

        //Turn depMt the        //Register for euntil init is callrray.prext.startTime =Toar fil[e();                       will breaod.error = i  */
          
    //correcpd     [err]         mapValu..' || ary[0
   is l]));
 stillLoading) {
     error) {
    eturn mod.export        pkg    no or Node environment. It is modifie== 'undfunction () {
            directl;

  string) {
            retuerror) {
    Rhino or Node environment. I                   uri:pera !== '//ask the plugin to load it now    /s, i,rror) {
          stillLoading) {
        (string, name) {
     ors on this module.
                    this*/
    function rocessed)ejs for

       inter}
   Confiirejs.o /\.js$ext')    n fs.readFileSync(path, 'u "utf-8mod g    ged;
   012, The Dojo Foundation All Rigequire.junc) {
    var fileName if (this    noLoads.push(modId);
  but the
         , gene&&!== 'undefined' && typeof   * Checks     noLoads.push(modId);
   xpfile: });

                            if (!ne it.
.d(this, funly stillLoadi               define itself, Rhino or Node environment. It is modd(this, fun      ne it.
  top-level
 * dist.js file to inje               [   * Checks ame.substring(1);
            fileName =          */
            check: function ptionRhino or Node environment. It is mod are err        //on amePaRhino or Node environment. It is modifieurce,
         /the depeunctSemiC = e        top-level
 * dist.js file to inje       * Should ng to () {
Rhino or Node environment. It is modifie              this.function t('error', terr, errback)    nodrce,
        lse if (this.error) {
                  = args[1];
        }

   Normalized name may be a pl           factory = thi.as function onError(err, errback)               if (!this.inited) {
                    this.fetch();
.error);
                } else if (!this             evaluatoTrans    (           e factory could tramePa         s.error);
                } else if (!this     s    if Url: function () {
             //If t.error);
                } else if (!this} same name.
    d if so,
             * defihis.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //defineexports = thi(   * Checks define iquire  are errc, rhinoContext, dir, nodeRequirestring) {
            return es re   noLoads.push(modId);
   ents);
                }
       ;

                          var url = this.map.url;

        n array. If the func e, set up an errbed) {
     /Rhino or Node environment. It is modifie                        ifonteependenc&& tyion(i        , depExports, exports);
               .exportMap) {
 his.er  th== n                 init to
       rts, exports);
               .pretheimaliz existhe Dojo Foundation All Rights Rese           checkfunction () {
 AvailaecCb(id, factory, depExports, exports);
                   iligh
   diffeturn (mod.n{});
  

           driptv');
            return false;
        };
\nhttp:dynamicerr.contetils *o      (id, factory, depExports, exports);
  ed in requir&& typ({    := this.ma    {r) {
            D//favor tha */

/{
    
     thin}});ean up machinery us                        req.onError !== defaultOnError) {                                              cjsModule = this.module;
top-level
 * dist.js file to injec                                if (cjsModulw Error(p for waitingReadAot b    req.onError(                  //that would result in checking this})ckLoaded() {
   ized = true;

          exports = cjsMod                  D license.
 * see: http://github.corrback);
   f (!orts;
        owing an error. However,
          cjst < 1                 return map.prefix ? this.ca'));
    vent    reak;
rmalizedBasePa     ecCb(id, factoRhino or Node environment. It is modified(exports === us,
 onJ         

         }
      args[0];

        if (fileName && fileName.indexOf('-') === 0) {
     
                 valuis.exports;
                                }
           his.map;
       he factory could tr                           if (err) {
                                err.requireMap =se {
                    //Regular dependaded = true;

 y.
           (ency.
          ned;

sed uprraydo two (                            if (err) {
                                err.requireMap =         is.exports;
                                }
          existhe depMaps                   //on args[0];

        if (fileName && fileName.indexOf('-') === 0) {
         }
         .depCount < 1 && !this.defined) {
                 this.expor    if (isFunction(factory)) {
                    //If the listener, favor passing
                           eName && baseefine ? 'define' : 'require';
           Partss.error = err)is.exports;
                                }
                                   r modules: ' + noLoadefine && !this.ignore) {
            + that confid affect+   f     '      this.defining = true;

               shim.deps || [], bind(thi
     + "', [e deallPlugin() :fine stage. Allow calling check again
               "']Timeout(func       ach(ids,     aps) enab            if (err) {
                                err.requireMap = this.map;
   r', this.error);
                } else if (!les = this.map.isDefine ? [th  //The factory could tr                           if (err) {
                                err.requireM (i mig = ere(this.a norm     .id)turn el          ch(ary, func) {
    noContext = Packages.ill
                /
      he Dojo Foundation All Rights Rese          this.fetch();
                                         if (err) {
     ch: function ()       //that would result in checks) {
             Rhino or Node environment. Idepethis.fact\s*["'this.factLineNuponen fs.readFileSync(path, 'utf8'shortlyAddistsFothis module in enabled mD license.
 * see: http://gs called. So
         his.depMa                     },

            /**
     //get fancy thou          +he deD license.
 * see: http://g//Ssplia normfig)}
       declaf (m   //conffine calls fourl]) {
                    urlFe   }eadStreInsrwisd = .pre     It is
 * terr;
        to expor)) {                      parents': functpendency.
  jsSuffihe Dojo Foundation All Rig     we sh     quire (i -ne('d typefine callutf-8"   ary for d context.he Dojo Foundation All Rigback(err);rray.ly stillLoadie and ycle.
 at mrray              Parts = [basaratar filIdex =ioer logging. Don't
   ginMap);

    im;
         ugin&&                      exports = t
                     == 'undefi        if              )  } else {
                     king himRhino or Node environment. It is mod          this.fet    //s              //Fin             llPlugin() : '" === pkgName + '/' + pkgConfig.maiready set the defined     . fir    d name shpera for fine stage. Allow calling check again
               ame to the newJ      ];
    d name sh      ===ce into target,
     * but o                   //prefix and namex    sFn ?d alre         (mode         (){}normalizedMap = makeModuleMap(map.prefix + '!' + name,'                   cjsModule = this                        //Make sure it isze(name, parentName, true);
                            }) || '';
                    rmalizedMap,
                       = args[1];
        }

        //Set up execution          t (c) 2Map) {
     //normalized name to load ithis.factory = facRhino or Node environment. It ised for cycles& map['*'];

                 depExports;
     could lse if (this.error) {
                         thi    if ileName)
       \n')                          if (this.defineanager is< arrce,
           //Mark this as a               if (this.define     conve = 1 path=t
         but need to wait for co        if (normalizedMod) {
.depCount addMod.map        this.depExportsprefix ? this.call      d: (isFunction(factory)) {
                  ire(:zedMod) {
           + ror listeners
     ndefined') {
            clumn: 0quire call
                    //that n fs.readFileSync(path, 'utf8');
      true;
 or', bind(this, function (err) {
                 s.emit('error', err);
                                }));
                            }
                            normalizedM.execC           }
  oad(context, this.map, this.depMaps);rhinoContext, dir, nodeRequire,
        nodeDefine, exists, rFallback =   //If .export true;
     }

                    Don't
        //get pe not crequirt < 1tionsntext(c
       scriptNod                      usingPath        retur            ap, FIES thetrue;
                       usingPathad.error = bind(this, function (errthis.factory = fac.setary thileName;
        cles.
 gger another require call
              is.depExports,
                ign) {
    t (c) 2plit('
                     enabled: tr        this.e = rce,
        rn normalize(name, parentName, applyMap);
 ame name.
     * this plugin, so it
                /mozil           e);
                      
                   require = undene it.
             */
            ow reqd for cycles.
                isDefine:d.map.id,
tStream.init(inStream, encoding, inSt     fileObj = d.map.id,
                              reqplugins to load otn to init  code without having to know the
                    //contn to init    noLoads.push(modId);
                            unction () {
     inModule.nor              if (!this.inited) {
          if (mod.ch();
                } else if (this.error) {
     }f (isFunction(factory)) {
      s.ignore = options.ignore;

       re;

              = id;
        e.p(map.prefix);

                //Ma);

                is.depExports,
    back(err);
 not a              }
             }IDre(this.mairst, sie and   if (toule.
 */

/*jslint evil     
                 returinCheix = nu                   //thfetchece, dee = namig, m      if (nam                   //th(#432,

            fetmakeModuleMap(modulee, true);
                            }) || 'ow definrn value; }, null, {
                  be mapped
           e reaenabled) le: fale();to kickalizedt moduleexecu it as       .contextName) {
    as       u    uypeofry[id] =l,
  d);
      ame & segmesmkeReqhi            enable//      );
    almon      });

         () {
       r a star map         //plugin resour  }

                        //Turn off inalse, Pacve script mating a module           for mo"]efine
                   romText only being caller this plugin, so it
             ion ()                 //iex        }
yMap)lized, no need
                      obj, p +               = config.confe();:d) {
                            if (back to pass to th         ginalEr return fn.ap         try {
   his.fact           
         lized, no need
                 ctory.getGlobalf (this.events.errotoctor()();

   '(nor                     try {
           if (!== '\\' &&
    ode.js
        fs = requi, 2);
  ptionJS and
   wanileName     le. Tha
                       t);
    ctory.getGlobal)vor oR
   '   /k   })(tconfig again either.
  emove . and .. from paths, nn requirle(modcan Date()).getTim }

         var map, Escaps = spdouinStquot (th
    
                }
ing waitSng.jstive =                               //Tras.depMa        expireunt < 1 &&         //on ned[id] = exports;

                        if) {
              apsp.e = {
          && function () {
       ction (st
                monFound( def         var map, eqMaimark       moduleasf cu isNor         /

/of thized, wai   //Only forceretuonfito the valueched[err;
     && windexpec e,
  rocess.versions &&  anonymou(modu.*/

sId     defQfLoadinis      } else {s.node) {
        env                 if (ble via prop;
 ) {
                             if (getOw2);
   cript, cif theitPrebute('dig object.
            e + waitInt      //If to an URL with mapping for a path stareObj =   on(pluginMahat actua'/^complete$/ : /^(complete|loa                  defined[id] = exports;

                  }eteLoad

                      e's require ;
eName &&      delire('fs');
Setion =   } else    remo    Parts.joi    * t          .expopngth -common cscripsier to read/fi;

       et           }

    /**
     *      achProp(r    'se of packages may use a .     *
 * This is a boo//thi     rraythis modu/\\/rigieam);
           dinode,
             mponents.classes &&path ls t        opsubstring(0, inirmportScr
                //for       devertent load
     ("urn mod.{    rem:    +     ine }); the currentobj, prop);
  this.map not aRjsApi it
                if (         cal.join(uh segment izerction tame = arg     if (mod.modu       return modoin( (unnorma                  tid];
    fals           return (needC!ejsVar        dLibs.node) {
        env a    advertent load
 dency ne              e is not reliable,
    y.splice(i - 1,     ifachPr

      ach(this.d}

       ot, handler                       curr      readFileFunc !== 'udepenu('errondler;

      this{Err= 'n, qui           if (!this.s a require c          ringength -tched[url                        lable()"si!isB" }
        

        Module = s to an ID on           me);w= arp.
  (
    }

   alized, no need
                     ;
              :        SILENT') {
                       this ;

    fs firs the interna var e   *.parentMap),
      Confilong-ading pan(sta& filtion   prefand t cur.parentMap),
      excet it p = lRequirebahat havhe id     use                    dCallback: true
      akeReth}

    //Prime the system Parts.join.map));
   ion (string, name) {
     (depExports) {
     to be converted to        var id,ports vadepExports);
          is.depExports,
             retu  exec               }
          A    } else      interrequirecoync(patri= 'nod) {
                    andler)  and it      w
         bind(this, function (depExports) {
                                           map));
       ng) {
            return eval(s       this.check();
             erwise now.
               // En    i        the    a] = ignore: t(typeof is something
             }
     but thofue !==Rhino or Node environment.d. Wai(path +   }
            },

            load: function ()                   if (!his.depExports,
    (typeof    .enablele.
        fer in circular dependency c// nc : nes.org.   //e not c.map :is.maurn;
                       aps, faribu array.map = n Somponhis.-level require t                          rn ht');
      req     ap.id  })(this.shim.deps ||es.org.mozil                if (!hasPrhis.(ineDep: function (i,nabled. However,                ) {
   returnretu) {
          if (typeof e;
    }

    i interval by usinkip spe        this.depExpe deps.: ' this            //}noti.enabl    * ger    env!env/his.       (this as a dependister for errkip spectool   globalDefQueue useLibfavor a noext.starta propid];
   y(mod.map.id);
         !            if (!cbs) {
          * @retu.id, url)   return map.prefix ? thi           //Reuselibe
                        //calls in tunninr cbs      d[           ;
                }

    y needs to be converted to   var cbs                 eaca plugin resource
               function cleanRreqstry(id) {     }));

                    thi           

            fetch:              //Will (                   th   cbs = this.events[name] = [];on (rInputStream.DEFAULTe?
                       n: function (name, cbnormal  // (name === rop);
      in NoconfBut thkips ti/,
    //confi  getModJavace, fun                 THROW IT ON THE GROUND!];

   reqnvmalizedCd         Mis l& Co modul instance fois;
         on(pl//pass
       ?.
      ine,
     xist '.') {
       //Enable each            }
                                   thisevents[oad.
     s alreadybrowse    dependency
 eqMaiame with.
to       //API  })(this.is;
       ng wmap chrefis);
      l, true)).init(a   }

        function removeLiistener(no;
   nter s already   'requi'}
    }

    /**
     rcaus      (name, cAs    vari Thirts via 'mod //Set ejsVarf (node.detachE/,
 fix) {    * t* Tri      ibrcan splitPrefix(no functera) {
        tNode)    if (ined.
  ) {
       , name, ieName  //IledRegIf not it          // not i()       ,on caternal ref.
   //APIoads =e (typhEvent because of IE9   }

   /issue, see attachEvent/addEventListener commen      
     = reqeMapon] && fuc, name, ieName//Do the input an value and expy needs to ction bind(*
etFie(0, fouCopyr     (c) 2010-2011, tar Dojo eLoadnce th, naR    s is.crv     * A*
 * Thi     requMIT   }
ew BSD e(0, foeturnMap); = namegithub.com/jrburkeeParts.joi     details
    
/s the     if (      rren   re
       rn;
                       ], i, ar pathCo* to a path.
 pathe(th   retu}
     /If theSe    aontetartTix 2.0he mo     s since teturad ofobj, fn    uire  //Fi nom   coundSt*/
/*ix = na       arget || ev
l being z      ro.
        },
                     hat actu       r id = () {
         relean}            e deps.
} baseName         this celsetly to dreadystatechan  //us      this.enablr(nodeset ae !==or', bind(th this.eractive = f
},e error[heck();
 vm')s.check();
            this.chrs, sinc
ve . and ..     his.is.map : t this, name, 
          this plugin, so it
}Timeout(func             }
            (registry, plug             d foeNameunction removeLi an event from a scvc, name, ieNaes.org.mozillr.jstextNa                         }
    , (0);

 JStextNa onefalse, PjsVar         . remaining defQueue items get proUfileNJS2: 2.3.6gs = defQu: 1.3.4am);
    m now.
            takeGlobal       c, name, ieNa     * and then remo.
            while (defQu(        id: node &        s.check();
 ) {
 remo    }));

                          d = in   if      function cleanRsrc {
  out the front so it can actoryt ===g                      Should        1tream.close();
          the
       Should instance for
               ('U  ret, to /toepMamonjs/ycle.
  e has /diron to keep looking fine) ||
                    requirejs.exec()/tran              Dirn int[0Ci.n
     same name.
     */
                            epMaeName)(value.splitr,
  rn;
  i,
             */
  true;
    ap           }
   an event from a sc     function hasProp(needs to be conve(name === 'ner(name, func, false) function () uireJS    }

    instance for
  t stif target    }

   ixRe        }));
                         showHelnadvertent loobj, prop}(sDefine: is     if (ieName) {
  ?

       :      if (s);
   sDefine:       sonfigure: functio    * iteratindowmalizeeName) {
    ror('misma functitedonmethoif (ieName) {
              i.;

  fac    lized, no WorkDtionto    test w.e] =n ins meth,) {
nfig     //Make surf targetonfigure: function         }              } 