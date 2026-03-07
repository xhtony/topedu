(function (window, $) {
    "use strict";

    var config = window.APP_CONFIG || {};
    var api = window.ApiClient;
    var userKey = config.USER_KEY || "topedu.currentUser";

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

    function getUser() {
        var raw = safeGet(userKey);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw);
        } catch (err) {
            return null;
        }
    }

    function setUser(user) {
        if (!user) {
            safeRemove(userKey);
            return;
        }
        safeSet(userKey, JSON.stringify(user));
    }

    function clearAuth() {
        api.clearAccessToken();
        safeRemove(userKey);
    }

    function isAuthenticated() {
        return !!api.getAccessToken();
    }

    function normalizePayload(response) {
        if (!response) {
            return {};
        }
        return response.data ? response.data : response;
    }

    function getDisplayName(user) {
        if (!user) {
            return "";
        }
        return user.name || user.username || user.email || "Account";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getLoggedOutItems() {
        return [
            '<li class="auth-menu-item"><a href="login.html">Login</a></li>',
            '<li class="auth-menu-item"><a href="register.html">Register</a></li>'
        ].join("");
    }

    function getLoggedInItems(user) {
        var name = escapeHtml(getDisplayName(user));
        return [
            '<li class="auth-menu-item auth-user"><a href="javascript:void(0);">Hi, ' + name + "</a></li>",
            '<li class="auth-menu-item"><a href="javascript:void(0);" data-auth-logout="1">Logout</a></li>'
        ].join("");
    }

    function renderAuthNav() {
        var currentUser = getUser();
        var html = currentUser && isAuthenticated() ? getLoggedInItems(currentUser) : getLoggedOutItems();

        ["#nav", "#dropdown > ul"].forEach(function (selector) {
            var $menu = $(selector);
            if (!$menu.length) {
                return;
            }
            $menu.find(".auth-menu-item").remove();
            $menu.append(html);
        });
    }

    function getQueryParam(name) {
        var query = window.location.search.substring(1);
        var pairs = query ? query.split("&") : [];
        for (var i = 0; i < pairs.length; i += 1) {
            var item = pairs[i].split("=");
            if (decodeURIComponent(item[0]) === name) {
                return decodeURIComponent((item[1] || "").replace(/\+/g, " "));
            }
        }
        return "";
    }

    function getRedirectTarget(defaultPath) {
        var redirect = getQueryParam("redirect");
        if (redirect && redirect.indexOf("http") !== 0 && redirect.indexOf("//") !== 0) {
            return redirect;
        }
        return defaultPath || "index.html";
    }

    function showMessage($el, message, isError) {
        if (!$el || !$el.length) {
            return;
        }
        $el.removeClass("success error");
        $el.addClass(isError ? "error" : "success");
        $el.text(message || "");
    }

    function login(credentials) {
        return api.post("/auth/login", credentials, { skipAuth: true }).then(function (response) {
            var payload = normalizePayload(response);
            if (!payload.accessToken) {
                throw new Error("Missing access token from login response.");
            }
            api.setAccessToken(payload.accessToken);
            setUser(payload.user || null);
            return payload;
        });
    }

    function register(registerData) {
        return api.post("/auth/register", registerData, { skipAuth: true }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function logout() {
        return api.post("/auth/logout", {}, {}).always(function () {
            clearAuth();
            renderAuthNav();
        });
    }

    function refresh() {
        return api.post("/auth/refresh", {}, { skipAuth: true }).then(function (response) {
            var payload = normalizePayload(response);
            if (payload.accessToken) {
                api.setAccessToken(payload.accessToken);
            }
            if (payload.user) {
                setUser(payload.user);
            }
            return payload;
        });
    }

    function me() {
        return api.get("/auth/me").then(function (response) {
            var payload = normalizePayload(response);
            setUser(payload.user || payload);
            return payload;
        });
    }

    function bindLogout() {
        $(document).on("click", "[data-auth-logout='1']", function (event) {
            event.preventDefault();
            logout().always(function () {
                if (window.location.pathname.indexOf("login.html") === -1) {
                    window.location.href = "index.html";
                }
            });
        });
    }

    function bindLoginForm() {
        var $form = $("#login-form");
        if (!$form.length) {
            return;
        }
        var $message = $("#auth-message");

        $form.on("submit", function (event) {
            event.preventDefault();

            var data = {
                email: $.trim($("#login-email").val()),
                password: $("#login-password").val()
            };

            if (!data.email || !data.password) {
                showMessage($message, "Please fill in email and password.", true);
                return;
            }

            login(data)
                .done(function () {
                    showMessage($message, "Login successful, redirecting...", false);
                    window.location.href = getRedirectTarget("index.html");
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Login failed. Please check your credentials.";
                    showMessage($message, msg, true);
                });
        });
    }

    function bindRegisterForm() {
        var $form = $("#register-form");
        if (!$form.length) {
            return;
        }
        var $message = $("#auth-message");

        $form.on("submit", function (event) {
            event.preventDefault();

            var password = $("#register-password").val();
            var confirmPassword = $("#register-confirm-password").val();
            var data = {
                name: $.trim($("#register-name").val()),
                email: $.trim($("#register-email").val()),
                password: password
            };

            if (!data.name || !data.email || !password || !confirmPassword) {
                showMessage($message, "Please fill in all required fields.", true);
                return;
            }

            if (password !== confirmPassword) {
                showMessage($message, "Passwords do not match.", true);
                return;
            }

            register(data)
                .done(function (payload) {
                    var message = (payload && payload.message) || "Registration successful. Please verify your email before login.";
                    showMessage($message, message, false);
                    window.setTimeout(function () {
                        window.location.href = "login.html";
                    }, 1200);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Registration failed. Please try again.";
                    showMessage($message, msg, true);
                });
        });
    }

    function handlePageGuard() {
        var pageType = $("body").attr("data-auth-page");
        var requireAuth = $("body").attr("data-require-auth") === "true";

        if (pageType === "login" || pageType === "register") {
            if (isAuthenticated()) {
                window.location.href = getRedirectTarget("index.html");
            }
            return;
        }

        if (requireAuth && !isAuthenticated()) {
            var redirect = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
            window.location.href = "login.html?redirect=" + redirect;
        }
    }

    function init() {
        renderAuthNav();
        bindLogout();
        bindLoginForm();
        bindRegisterForm();
        handlePageGuard();

        if (isAuthenticated() && !getUser()) {
            me().fail(function () {
                refresh()
                    .done(function () {
                        me().fail(function () {
                            clearAuth();
                            renderAuthNav();
                        });
                    })
                    .fail(function () {
                        clearAuth();
                        renderAuthNav();
                    });
            });
        }
    }

    window.AuthService = {
        login: login,
        register: register,
        logout: logout,
        refresh: refresh,
        me: me,
        getUser: getUser,
        isAuthenticated: isAuthenticated,
        clearAuth: clearAuth,
        renderAuthNav: renderAuthNav
    };

    init();
})(window, jQuery);
