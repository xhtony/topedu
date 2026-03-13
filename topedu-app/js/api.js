(function (window, $) {
    "use strict";

    var config = window.APP_CONFIG || {};

    function safeGet(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    }

    function safeSet(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (err) {
            return;
        }
    }

    function safeRemove(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (err) {
            return;
        }
    }

    function buildUrl(path) {
        if (!path) {
            return config.API_BASE_URL || "";
        }
        if (/^https?:\/\//i.test(path)) {
            return path;
        }

        var base = config.API_BASE_URL || "";
        var normalizedBase = base.replace(/\/+$/, "");
        var normalizedPath = String(path).replace(/^\/+/, "");
        return normalizedBase + "/" + normalizedPath;
    }

    function getAccessToken() {
        return safeGet(config.ACCESS_TOKEN_KEY || "topedu.accessToken");
    }

    function setAccessToken(token) {
        var key = config.ACCESS_TOKEN_KEY || "topedu.accessToken";
        if (token) {
            safeSet(key, token);
            return;
        }
        safeRemove(key);
    }

    function clearAccessToken() {
        safeRemove(config.ACCESS_TOKEN_KEY || "topedu.accessToken");
    }

    function request(options) {
        var opts = options || {};
        var method = (opts.method || "GET").toUpperCase();
        var token = getAccessToken();
        var headers = $.extend({}, opts.headers || {});

        if (token && !opts.skipAuth) {
            headers.Authorization = "Bearer " + token;
        }

        var ajaxConfig = {
            type: method,
            method: method,
            url: buildUrl(opts.url || ""),
            headers: headers,
            xhrFields: {
                withCredentials: true
            }
        };

        if (opts.data !== undefined) {
            if (method === "GET") {
                ajaxConfig.data = opts.data;
            } else {
                ajaxConfig.data = JSON.stringify(opts.data);
                ajaxConfig.contentType = "application/json; charset=UTF-8";
            }
        }

        return $.ajax(ajaxConfig);
    }

    window.ApiClient = {
        request: request,
        get: function (url, params, options) {
            return request($.extend({}, options || {}, {
                method: "GET",
                url: url,
                data: params
            }));
        },
        post: function (url, data, options) {
            return request($.extend({}, options || {}, {
                method: "POST",
                url: url,
                data: data
            }));
        },
        put: function (url, data, options) {
            return request($.extend({}, options || {}, {
                method: "PUT",
                url: url,
                data: data
            }));
        },
        patch: function (url, data, options) {
            return request($.extend({}, options || {}, {
                method: "PATCH",
                url: url,
                data: data
            }));
        },
        del: function (url, data, options) {
            return request($.extend({}, options || {}, {
                method: "DELETE",
                url: url,
                data: data
            }));
        },
        getAccessToken: getAccessToken,
        setAccessToken: setAccessToken,
        clearAccessToken: clearAccessToken
    };
})(window, jQuery);
