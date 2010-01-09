/*!
* AppleOfMyIframe
**
    JavaScript library for creating & manipulating iframe documents on-the-fly
        github.com/premasagar/appleofmyiframe

    by Premasagar Rose
        premasagar.com
        dharmafly.com

    license:
        opensource.org/licenses/mit-license.php

*//*

    requires jQuery (so far only tested with jQuery v1.3.2)
    creates methods:
        jQuery.iframe()
        jQuery(elem).intoIframe()
        
    **
    
    contributors:
        Alastair James: github.com/onewheelgood
        Jonathan Lister: jaybyjayfresh.com
    
    **
    
    ~2.7KB minified & gzipped

*/

'use strict';

(function($){
    // Anon and on
    function isUrl(str){
        return (/^https?:\/\/[\-\w]+\.\w[\-\w]+\S*$/).test(str);
    }
    function isElement(obj){
        return obj && obj.nodeType === 1;
    }
    function isJQuery(obj){
        return obj && !!obj.jquery;
    }
    // From jQuery; required for .live() and .die() methods
    function liveConvert(type, selector){
        return ["live", type, selector.replace(/\./g, "`").replace(/ /g, "|")].join(".");
    }    
    // Utility class to create jquery extension class easily
    // Mixin the passed argument with a clone of the jQuery prototype
    function JqueryClass(proto){
        return $.extend(
            function(){
                this.init.apply(this, arguments);
            },
            {
                // deep clone of jQuery prototype and passed prototype
                prototype: $.extend(true, {}, $.fn, proto)
            }
        );
    }


    var
        // AOMI script version
        version = '0.25',
    
        // Namespace
        ns = 'aomi',
        
        // Environment
        win = window,
        
        // Browsers
        browser = $.browser,
        msie = browser.msie,
        ie6 = (msie && win.parseInt(browser.version, 10) === 6),
        opera = browser.opera,
        
        // Browser behaviour booleans
        loadTriggeredOnDocumentClose = opera || msie, // TODO: verify this, with different browser versions
        documentDestroyedOnIframeMove = !msie,
        externalIframesInvisibleOnAppend = ie6,
        
        // Shortcuts
        event = $.event,
        
        // Settings
        cssPlain = {
            margin:0,
            padding:0,
            borderWidth:0,
            borderStyle:'none',
            backgroundColor:'transparent'
        },
        
        defaultOptions = {
            attr:{
                scrolling:'no',
                frameBorder:0,
                allowTransparency:true
            },
            src:'about:blank', // don't include in attr object, or unexpected triggering of 'load' event may happen on applying attributes
            doctype:5, // html5 doctype
            target:'_parent', // which window to open links in, by default - set to '_self' or '_blank' if necessary
            autoheight:true, // shrink the iframe element to the height of its document body
            css:$.extend(
                {width:'100%'}, // ensures that iframe element stretches to fill the containing width
                cssPlain
            ),
            title:'' // a title for the iframe document
        },
                
        // Main class
        AppleOfMyIframe = new JqueryClass(
            $.extend({
                init: function(){
                    var 
                        aomi = this,
                        // Cache the constructor arguments, to enable later reloading
                        args = this.args($.makeArray(arguments))
                            .args(), // retrieve the sorted arguments
                        options = this.options(),
                        fromReload;
                    
                    // If a url supplied, add it as the iframe src, to load the page
                    // NOTE: iframes intented to display external documents must have the src passed as the bodyContents arg, rather than setting the src later - or expect weirdness
                    if (isUrl(args.bodyContents)){
                        options.src = args.bodyContents;
                        
                        // IE6 repaint - required a) for external iframes that are added to the doc while they are hidden, and b) for some external iframes that are moved in the DOM (e.g. google.co.uk)
                        if (externalIframesInvisibleOnAppend){
                            this.ready(this.repaint);
                        }
                    }   
                    // If an injected iframe (i.e. without a document url set as the src)
                    else {
                        this
                            // When an iframe element is attached to the AOMI object, bind a handler function to the iframe's native 'load' event
                            .bind('attachElement', function(){
                                this.iframeLoad(function(){
                                    var handler = arguments.callee;
                                    
                                    // If the iframe has properly loaded
                                    if (aomi._okToLoad()){
                                        aomi
                                            // Unbind this handler
                                            .iframeLoad(handler, true)
                                            
                                            // Write out the new document
                                            .document(true)
                                            
                                            // Bind an AOMI 'load' handler to the native 'load' event
                                            // NOTE: We do this after the document is written, because browsers differ in whether they trigger an iframe load event after the doc is written. So, we manually trigger the event for all browsers.
                                            .iframeLoad(function(){
                                                aomi.trigger('load');
                                            });
                                        
                                        // Normalise browser event triggers by triggering load event, if not triggered by the browser
                                        if (!loadTriggeredOnDocumentClose){
                                            aomi.trigger('load');
                                        }
                                        
                                    }
                                    else if (documentDestroyedOnIframeMove){
                                        aomi.reload();
                                    }
                                    // In IE, just replace the iframe element, as a reload would be unable to restore() the contents
                                    else {
                                        aomi.replace();
                                    }
                                });
                            });
                        
                        // Setup auto-resize event listeners
                        if (options.autoheight){
                            // After the constructor 'ready' callback
                            this.one('load', function(){
                                this
                                    // Resize the iframe to the body contents
                                    .resize()
                                    
                                    // Then set up event listeners to resize later on
                                    .bind('reload', this.resize)
                                
                                    // On appending to the head
                                    .bind('manipulateHead', this.resize)
                                    .bind('manipulateBody', this.resize);
                                    // TODO: Ideally, we'd autosize the iframe whenever any of its content is manipulated, e.g. by listening to DOM mutation events on the contents
                        
                                // Global window resizing
                                $(window).resize(function(){
                                    aomi.resize();
                                });
                            });
                        }                            
                        
                        // Setup iframe document caching
                        // Ridiculously, each time the iframe element is moved, or removed and re-inserted into the DOM, then the native onload event fires and the iframe's document is discarded. (This doesn't happen in IE, thought). So we need to bring back the contents from the discarded document, by caching it and restoring from the cache on each 'load' event.
                        if (documentDestroyedOnIframeMove){
                            this
                                // Track when an 'extreme' reload takes place
                                .bind('extremereloadstart', function(){
                                    fromReload = true;
                                })
                                .load(function(ev){
                                    // If an extreme reload, then don't restore from cached nodes - a) because the original constructor args are used, b) because probably the browser doesn't support adoptNode, etc, so we'll end up reloading again anyway during cache(), leading to an infinite loop          
                                    if (fromReload){
                                        fromReload = false;
                                    }
                                    // Restore from cached nodes. Not restored if the body already has contents.
                                    // TODO: Could it be problematic to not restore when there is already body contents? Should we check for head contents too?
                                    else if (!this.body().children().length){
                                        this.restore();
                                    }
                                    this.cache();
                                });
                        }
                    }
                    
                    return this
                        // Attach the iframe element
                        ._attachElement()
                        
                        // Init complete
                        .trigger('init');
                },
            
                $: function(arg){
                    var doc = this.document();
                    return arg ? $(arg, doc) : doc;
                },
                
                
                // doctype() examples:
                    // this.doctype(5);
                    // this.doctype(4.01, 'strict');
                    // this.doctype() // returns doctype object
                doctype: function(v){
                    var doctype;
                                    
                    if (v){
                        this.options().doctype = v;
                        return this;
                    }
                    v = this.options().doctype;
                    doctype = '<!DOCTYPE ';
                    if (v === 5){ // html5 doctype
                        doctype += 'html';
                    }
                    return doctype + '>';
                },
                
                // NOTE: We use $.event.trigger() instead of this.trigger(), because we want the callback to have the AOMI object as the 'this' keyword, rather than the iframe element itself
                trigger: function(type, data){
                    /**/
                    // DEBUG LOGGING
                    var debug = [this.attr('id') + ': *' + type + '*'];
                    if (data){
                        debug.push(data);
                    }
                    //debug.push(arguments.callee.caller);
                    _.apply(null, debug);
                    // end DEBUG LOGGING
                    /**/
                    
                    event.trigger(type + '.' + ns, data, this);
                    return this;
                },
                
                bind: function(type, callback){
                    event.add(this, type + '.' + ns, callback);
                    return this;
                },
                
                unbind: function(type, callback){
                    event.remove(this, type + '.' + ns, callback);
                    return this;
                },
                
                one: function(type, callback){
                    var aomi = this;
                    return this.bind(type, function outerCallback(){
                        callback.apply(aomi, $.makeArray(arguments));
                        aomi.unbind(type, outerCallback);
                    });
                },
                
                live: function(selector, type, fn){
		            var proxy = event.proxy(fn);
		            proxy.guid += selector + type;         
		            this.body()
		                .bind(liveConvert(type, selector), selector, proxy);         
		            return this;
	            },
	            
	            die: function(selector, type, fn){
		            this.body()
		                .unbind(liveConvert(type, selector), fn ? {guid: fn.guid + selector + type} : null);
		            return this;
	            },
                
                /*
                Examples:
                aomi.history(-1);
                
                aomi.load(0); // index in history
                aomi.load(fn); // init? or bind callback for future 'load' events?
                => aomi.document(head, body); // etc
                
                $.iframe.doctypes = {
                    html5: '<!DOCTYPE html>'
                };
                
                aomi.doctype('html5') === $.iframe.doctypes['html5'];
                */
                
                document: function(){
                    var
                        args = $.makeArray(arguments),
                        doc;
                    
                    try {
                        doc = this.window().attr('document');
                    }
                    catch(e){}
                    
                    if (!args.length){
                        return $(doc || []);
                    }
                    // Cache the passed arguments
                    if (args[0] !== true){
                        this.args(args);
                    }
                    
                    // Doc is ready for manipulation
                    if (doc){
                        doc.open();
                        doc.write(
                            this.doctype() + '\n' +
                            '<head></head><body></body>'                    
                        );
                        doc.close();
                        this
                            ._trim()
                            // Apply the cached options & args
                            .args(true)
                            // Trigger the 'ready' event, which is analogous to the $().ready() event for the global document
                            .trigger('ready');
                    }
                    // Doc not ready, so apply arguments at next load event
                    else {
                        this.one('load', function(){
                            this.document(true);
                        });
                    }
                    return this;
                },
                
                args: function(){
                    var
                        aomi = this,
                        args = $.makeArray(arguments),
                        defaultArgs = {
                            headContents: '',
                            bodyContents: '',
                            callback: function(){}
                            // NOTE: options arg is handled by aomi.options()
                        },
                        argsCache = this._args || defaultArgs,
                        found = {},
                        optionsFound;
                    
                    // Return cached args
                    if (!args.length){
                        return $.extend(true, argsCache, {
                            options:this.options()
                        });
                    }
                    
                    // An array of args was passed. Re-apply as arguments to this function.
                    if ($.isArray(args[0])){
                        return this.args.apply(this, args[0]);
                    }
                    if (args[0] === true){
                        // apply cached options and constructor arguments
                        this
                            .options(true)
                            .contents(argsCache.headContents, argsCache.bodyContents, true)
                            // Call the callback on the next 'ready' event
                            .one('ready', argsCache.callback);
                    }
                    else {
                    
                        // All arguments are optional. Determine which were supplied.
                        $.each(args.reverse(), function(i, arg){
                            if (!found.callback && $.isFunction(arg)){
                                found.callback = arg;
                            }
                            else if (!optionsFound && typeof arg === 'object' && !isJQuery(arg) && !isElement(arg)){
                                aomi.options(arg);
                                optionsFound = true;
                            }
                            // TODO: If the bodyContents or headContents is a DOM node or jQuery collection, does this throw an error in some browsers? Probably, since we have not used adoptNode, and the nodes have a different ownerDocument. Should the logic in reload for falling back from adoptNode be taken into a more generic function that is used here?
                            else if (!found.bodyContents && typeof arg !== 'undefined'){
                                found.bodyContents = arg;
                            }
                            // Once callback and options are assigned, any remaining args must be the headContents; then exit loop
                            else if (!found.headContents && typeof arg !== 'undefined'){
                                found.headContents = arg;
                            }
                        });
                        this._args = $.extend(true, defaultArgs, found);
                    }
                    return this;
                },
                
                options: $.extend(
                    function(newOptions){
                        var
                            thisFn = this.options,
                            getDefaults = thisFn.defaultOptions,
                            options;
                        
                        if (newOptions){
                            // Cache new options
                            if (typeof newOptions === 'object'){
                                this._options = $.extend(true, getDefaults(), newOptions);
                            }
                            // Apply cached options to iframe
                            else if (newOptions === true){
                                options = this.options();
                                this
                                    // Re-apply cached title
                                    .title(true)
                                    
                                    // Let anchor links open pages in the default target
                                    .live('a', 'click', function(){
                                        if (!$(this).attr('target') && $(this).attr('href')){
                                            $(this).attr('target', options.target);
                                        }
                                    });
                            }
                            return this;
                        }
                                                
                        // No args passed
                        if (!this._options){
                            this._options = getDefaults();
                        }
                        return this._options;
                    },
                    {
                        defaultOptions: function(){
                            return $.extend(true, {}, defaultOptions);
                        }
                    }
                ),                
                
                load: function(callback){
                    return this.bind('load', callback);
                },
                
                ready: function(callback){
                    return this.bind('ready', callback);
                },
                
                reload: function(extreme){
                    // 'soft reload': re-apply src attribute
                    // NOTE: documentDestroyedOnIframeMove is included here, as only those browsers will have a 'soft' reload trigger the restore() method. Other browsers (that is, IE), should instead perform a hard reload
                    if ((!extreme && documentDestroyedOnIframeMove) || !this.hasBlankSrc()){
                        this.attr('src', this.attr('src'));
                    }
                    // 'hard reload': re-apply original constructor args
                    else {     
                        this.trigger('extremereloadstart');
                        this.document(true);
                    }
                    return this.trigger('reload', !!extreme);
                },
                
                // Duplicate this AOMI object. This will essentially clone the iframe element, its document and all its settings, provided that they have only been manipulated via the AOMI API - e.g. by passing a function to the original constructor
                // TODO: should args() be able to return as an array, so we can do an apply() on $.iframe?
                clone: function(){
                    var args = this.args();
                    return $.iframe(args.headContents, args.bodyContents, this.options(), args.callback);
                },
                
                // Replace the iframe element with the iframe element from a replica AOMI object
                replace: function(){
                    var newIframe = this.clone();
                    
                    this.replaceWith(newIframe);
                    this[0] = newIframe[0];
                    return this.trigger('replace');
                },
                
                // Trigger a repaint of the iframe - e.g. for external iframes in IE6, where the contents aren't always shown at first
                repaint: function(){
                    var className = ns + '-repaint';
                    this
                        .addClass(className)
                        .removeClass(className);
                    return this.trigger('repaint');
                },
            
                window: function(){
                    var win = this._windowObj();
                    if (win){ // For an injected iframe not yet in the DOM, then win is null
                        try { // For an external iframe, win is accessible, but $(win) will throw a permission denied error
                            return $(win);
                        }
                        catch(e){}
                    }
                    return $([]);
                },
                
                location: function(){
                    var
                        win = this.window(),
                        loc = win.attr('location');
                        
                    if (loc){
                        try {
                            return loc.href; // location href is available, so iframe is in the DOM and is in the same domain
                        }
                        catch(e){}
                    }
                    return this._windowObj() ?
                        null : // iframe is in the DOM, but has a cross-domain document
                        this.attr('src'); // iframe is out of the DOM, so its window doesn't exist and it has no location, return iframe
                },
                
                contents: function(headContents, bodyContents, emptyFirst){
                    if (typeof bodyContents === 'undefined'){
                        bodyContents = headContents;
                        headContents = false;
                    }
                    return this
                        .head(headContents, emptyFirst)
                        .body(bodyContents, emptyFirst);
                },

                head: function(contents, emptyFirst){
                    var
                        head = this.$('head'),
                        method = 'append';
                    
                    if (typeof contents !== 'undefined' && contents !== false){
                        if (head.length){
                            if (emptyFirst){
                                head.empty();
                            }
                            head[method](contents);
                            this.trigger('manipulateHead', method);
                        }
                        // Document not active because iframe out of the DOM. Defer till the next 'load' event.
                        else {
                            this.one('load', function(){
                                this.head(contents, emptyFirst);
                            });
                        }
                        return this;
                    }
                    return head;
                },
                
                body: function(contents, emptyFirst){
                    var body = this.$('body');
                    if (typeof contents !== 'undefined' && contents !== false){
                        if (body.length){ // TODO: Perhaps this should also check if the 'ready' event has ever fired - e.g. in situations where iframe has just been added to the DOM, but has not yet loaded
                            if (emptyFirst){
                                body.empty();
                            }
                            this
                                .append(contents);
                        }
                        // Document not active because iframe out of the DOM. Defer till the next 'load' event.
                        else {
                            this.one('load', function(){
                                this.body(contents, emptyFirst);
                            });
                        }
                        return this;
                    }
                    return body;
                },
                
                title: function(title){
                    if (title === true){
                        return this.title(this.options().title);
                    }
                    if (typeof title !== 'undefined'){
                        this.options().title = title;
                        this.$().attr('title', title);
                        return this;
                    }
                    return this.$().attr('title');
                },
                
                style: function(cssText){
                    return this.head('<style>' + cssText + '</style>');
                },
            
                // TODO: If bodyChildren is a block-level element (e.g. a div) then, unless specific css has been applied, its width will stretch to fill the body element which, by default, is a set size in iframe documents (e.g. 300px wide in Firefox 3.5). Is there a way to determine the width of the body contents, as they would be on their own? E.g. by temporarily setting the direct children to have display:inline (which feels hacky, but might just work).
                resize: function(){
                    var
                        //bodyChildren = this.body().children(),
                        htmlElement = this.$('html');
                    
                    this.height(
                        htmlElement.outerHeight(true)
                        /*
                        bodyChildren.length ?
                            bodyChildren.outerHeight(true) :
                            htmlElement.outerHeight(true)
                        */
                        // TODO: Does htmlElement.outerHeight have problems, compared with measuring the total height of bodyChildren?
                    ); 
                    return this.trigger('resize');
                },
                
                // TODO: Currently, this will return true for an iframe that has a cross-domain src attribute and is not yet in the DOM. We should include a check to compare the domain of the host window with the domain of the iframe window - including checking document.domain property
                isSameDomain: function(){
                    return this.location() !== null;
                },
                
                hasExternalDocument: function(){
                    var loc = this.location();
                    return loc === null || (loc !== 'about:blank' && loc !== win.location.href);
                    // NOTE: the comparison with the host window href is because, in WebKit, an injected iframe may have a location set to that url. This would also match an iframe that has a src matching the host document url, though this seems unlikely to take place in practice.
                    // NOTE: this also returns true when the iframe src attribute is for an external document, but the iframe is out of the DOM and so doesn't actually contain a document at that time
                },
                
                hasBlankSrc: function(){
                    var src = this.attr('src');
                    return !src || src === 'about:blank';
                },
                
                cache: function(){	            
	                // iframe is not in the DOM
	                if (!this.$()[0]){
	                    return this;
	                }
	                
	                // Update the cached nodes
	                this._cachedNodes = this.head().add(this.body());
	                this.trigger('cache');
	                return this;
                },
                
                restore: function(){
                    // Methods to try, in order. If all fail, then the iframe will re-initialize.
                    var
                        methodsToTry = ['adoptNode', 'appendChild', 'importNode', 'cloneNode'],
                        appendMethod = $.iframe.appendMethod,
	                    htmlElement = this.$('html').empty(),
                        doc = this.$()[0],
	                    cachedNodes = this._cachedNodes;
	                    
	                if (!doc || !cachedNodes){
	                    return this;
	                }
	                
                    // If we don't yet know the append method to use, then cycle through the different options. This only needs to be determined the first time an iframe is moved in the DOM, and only once per page view.
                    if (!appendMethod){
                        appendMethod = this._findAppendMethod(doc, methodsToTry, htmlElement, cachedNodes) || 'reload';
                        $.iframe.appendMethod = appendMethod;
                    }
                    // If we've already determined the method to use, then use it
                    else if (appendMethod !== 'reload'){
                        this._appendWith(doc, appendMethod, htmlElement, cachedNodes);
                    }
                    // If the standard append methods don't work, then reload the iframe, using the original constructor arguments.
                    if (appendMethod === 'reload'){
                        // Remove the cached nodes, to prevent the reload triggering a new 'load' event => call to cache() => infinite loop
                        this._cachedNodes = null; // NOTE: In Opera 10.10, if we 'delete' the _cachedNodes property, weird stuff happens, so best to make null
                        this.reload(true);
                    }
                    // Re-apply the document title
                    // NOTE: We shouldn't need to re-apply any of the other options, such as CSS on the iframe element
                    else {
                        this.title(true);
                        
                        // TODO: TEMP HACK: why is this suddenly needed? The problem: in FF3.5 and WebKit, when the iframe element is moved in the DOM, the margin around the body contents is somehow not rendered as it should be. Not sure if there are problems with other CSS props.
                        this.body().contents().each(function(){
                            var el = $(this);
                            el.css('margin', el.css('marginTop') + ' ' + el.css('marginRight') + ' ' + el.css('marginBottom') + ' ' + el.css('marginLeft'));
                        });
                    }
                    
                    return this.trigger('restore', appendMethod);
                },
                
                // Advised not to use this API method externally
                // Proxy for iframe's native load event, with free jQuery event handling
                iframeLoad: function(callback, unbind){
                    var aomi = this;
                    
                    if (!unbind){
                        $(this[0]).bind('load', callback);
                        
                        // Prevent IE having permission denied error, when relying on jQuery's built-in unload event handler removal
                        $(win).unload(function(){
                            aomi.iframeLoad(callback, true);
                        });
                    }
                    else {
                        $(this[0]).unbind('load', callback);
                    }
                    return this;
                },
                
                _attachElement: function(){
                    var options = this.options();
                    
                    // Absorb a jQuery-wrapped iframe element into the AOMI object
                    $.fn.init.call(this, '<iframe></iframe>');
                    
                    // iframe element manipulation: apply attributes and styling
                    this
                        .css(options.css)
                        .attr(options.attr)
                        .attr('src', options.src);
                    
                    return this
                        // iframe document and contents: apply options
                        .options(true)
                        .trigger('attachElement');
                },
                
                _windowObj: function(){
                    try { // Can cause "unspecified error" in IE if the window's not yet ready
                        return this[0].contentWindow;
                    }
                    catch(e){
                        return false;
                    }
                },
                
                _appendWith: function(doc, method, parentNode, childNodes){
                    if ($.isFunction(doc[method])){
                        try {
                            childNodes.each(
                                function(){
                                    var newNode;
                                    switch (method){
                                        case 'cloneNode':
                                        newNode = this[method](true);
                                        break;
                                        
                                        case 'appendChild':
                                        newNode = this;
                                        break;
                                        
                                        default: // adoptNode & importNode
                                        newNode = doc[method](this, true);
                                    }
                                    parentNode.append(newNode);
                                }
                            );
                            return true;
                        }
                        catch(e){}
                    }
                    return false;
                },
                
                _findAppendMethod: function(doc, methods, parentNode, childNodes){
                    var aomi = this, appendMethod;
                    
                    $.each(methods, function(i, method){
                        if (aomi._appendWith(doc, method, parentNode, childNodes)){
                            appendMethod = method;
                            return false;
                        }
                    });
                                    
                    return appendMethod;
                },
                
                _trim: function(){
                    this.body()
                        .css(cssPlain);
                    return this;
                },
                
                _hasSrcMismatch: function(){
                    return (this.hasBlankSrc() && this.hasExternalDocument());
                },
                
                // A check to prevent the situation where an iframe with an external src is on page, as well as an injected iframe; if the iframes are moved in the DOM and the page reloaded, then the contents of the external src iframe may be duplicated into the injected iframe (seen in FF3.5 and others). This function re-appplies the 'about:blank' src attribute of injected iframes, to force a reload of its content
                _okToLoad: function(){
                    var ok = true;
                    if (this._hasSrcMismatch()){ // add other tests here, if required
                        ok = false;
                    }
                    return ok;
                }
            },
            
            // Add modified jQuery methods to the prototype
            (function(){
                var
                    jQueryMethods = [
                        {
                            // Methods to manipulate the iframe element
                            fn: [
                                'appendTo',
                                'prependTo',
                                'insertBefore',
                                'insertAfter',
                                'replaceAll'
                            ],
                            
                            wrapper: function(method){
                                return function(){
                                    $.fn[method].apply(this, arguments);
                                    // Work around browser rendering quirks
                                    if (!this.hasBlankSrc()){
                                        this.reload();
                                    }
                                    return this.trigger('manipulateIframe', method);
                                };
                            }
                        },
                        
                        {
                            // Methods to manipulate the iframe's body contents
                            fn: [
                                'append',
                                'prepend',
                                'html',
                                'text',
                                'wrapInner'
                            ],
                            
                            wrapper: function(method){
                                return function(){
                                    $.fn[method].apply(this.body(), arguments);
                                    return this.trigger('manipulateBody', method);
                                };
                            }
                        }
                    ],
                    methodsForPrototype = {};
                
                $.each(
                    jQueryMethods,
                    function(i, method){
                        var wrapper = method.wrapper;
                        $.each(
                            method.fn,
                            function(j, fn){
                                methodsForPrototype[fn] = wrapper(fn);
                            }
                        );
                    }
                );
                return methodsForPrototype;
            }())
        ));
        
    
    // Extend jQuery with jQuery.iframe() and jQuery(elem).intoIframe()
    $.extend(
        true,
        {
            iframe: $.extend(
                function(headContents, bodyContents, options, callback){
                    return new AppleOfMyIframe(headContents, bodyContents, options, callback);
                },
                {aomi: version} // script version number - for 3rd party scripts to verify that jQuery.iframe is created by AppleOfMyIframe, and to check the script version
            ),
            fn: {
                // TODO: Allow multiple elements in a collection to be replaced with iframes, e.g. $('.toReplace').intoIframe()
                // TODO: Where the element doesn't have an explicit width set, the iframe will not be able to resize to it. One hacky method to determine the width: display the element inline, measure its width, then return the display and then set the width of the iframe.
                intoIframe: function(headContents, options, callback){
                    return $.iframe(headContents, this, options, callback)
                        .replaceAll(this);
                }
            }
        }
    );
    
}(jQuery));

/*jslint onevar: true, browser: true, devel: true, undef: true, eqeqeq: true, plusplus: true, bitwise: true, regexp: true, strict: true, newcap: true, immed: true */
