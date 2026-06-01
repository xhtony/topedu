(function (window, $) {
    "use strict";

    var config = window.APP_CONFIG || {};
    var api = window.ApiClient;
    var userKey = config.USER_KEY || "topedu.currentUser";
    var adminCourseCache = [];

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

    function setAdminCourseCache(courses) {
        adminCourseCache = Array.isArray(courses) ? courses : [];
        $(document).trigger("topedu:courses-updated", [adminCourseCache]);
    }

    function getDisplayName(user) {
        if (!user) {
            return "";
        }
        return user.name || user.username || "Account";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function currencyLabel(code) {
        if (code === "CNY") {
            return "CNY (¥)";
        }
        if (code === "NZD") {
            return "NZD (NZ$)";
        }
        return code || "-";
    }

    function formatMoney(amount, currency) {
        var num = Number(amount || 0).toFixed(2);
        if (currency === "CNY") {
            return "¥" + num;
        }
        if (currency === "NZD") {
            return "NZ$" + num;
        }
        return num;
    }

    function formatDualMoneyLine(cnyAmount, nzdAmount) {
        var cny = Number(cnyAmount || 0);
        var nzd = Number(nzdAmount || 0);
        var parts = [];
        parts.push(formatMoney(cny, "CNY"));
        parts.push(formatMoney(nzd, "NZD"));
        return parts.join(" / ");
    }

    function billingReasonLabel(reason) {
        if (!reason) {
            return "—";
        }
        var labels = {
            REQUESTED: "指定币种",
            ONLY_CNY_WALLET: "仅人民币预存",
            ONLY_NZD_WALLET: "仅纽币预存",
            SUFFICIENT_BALANCE_CNY: "人民币余额充足",
            SUFFICIENT_BALANCE_NZD: "纽币余额充足",
            MAX_REMAINING_CNY: "扣人民币剩余更多",
            MAX_REMAINING_NZD: "扣纽币剩余更多",
            MIN_OVERDRAFT_CNY: "人民币透支更少",
            MIN_OVERDRAFT_NZD: "纽币透支更少",
            WALLET_CURRENCY_DEFAULT: "默认钱包币种",
            FALLBACK_CNY: "默认人民币"
        };
        return labels[reason] || reason;
    }

    function recordSourceLabel(source) {
        if (source === "ADMIN") {
            return "Admin";
        }
        if (source === "STUDENT") {
            return "Student";
        }
        if (source === "SYSTEM") {
            return "System";
        }
        return source || "—";
    }

    function formatRechargeBatchAmount(batch) {
        var parts = [];
        if (batch.amountCny != null && Math.abs(Number(batch.amountCny)) >= 0.01) {
            var cnyVal = Number(batch.amountCny);
            parts.push((cnyVal < 0 ? "-" : "") + formatMoney(Math.abs(cnyVal), "CNY"));
        }
        if (batch.amountNzd != null && Math.abs(Number(batch.amountNzd)) >= 0.01) {
            var nzdVal = Number(batch.amountNzd);
            parts.push((nzdVal < 0 ? "-" : "") + formatMoney(Math.abs(nzdVal), "NZD"));
        }
        return parts.length ? parts.join(", ") : "—";
    }

    function isRechargeBatchReversal(batch) {
        if (!batch) {
            return false;
        }
        if (batch.recordType === "REVERSAL") {
            return true;
        }
        return (
            (batch.amountCny != null && Number(batch.amountCny) < 0) ||
            (batch.amountNzd != null && Number(batch.amountNzd) < 0)
        );
    }

    function formatRechargeBatchPrepayment(batch) {
        var parts = [];
        if (batch.prepaymentCnyAfter != null) {
            parts.push(formatMoney(batch.prepaymentCnyAfter, "CNY"));
        }
        if (batch.prepaymentNzdAfter != null) {
            parts.push(formatMoney(batch.prepaymentNzdAfter, "NZD"));
        }
        return parts.length ? parts.join(" · ") : "—";
    }

    function formatRechargeBatchBalance(batch) {
        if (batch.balanceCnyAfter == null && batch.balanceNzdAfter == null) {
            return "—";
        }
        return formatDualMoneyLine(batch.balanceCnyAfter || 0, batch.balanceNzdAfter || 0);
    }

    function formatDualBalanceLine(balanceCny, balanceNzd) {
        var cny = Number(balanceCny || 0);
        var nzd = Number(balanceNzd || 0);
        var cnyText = formatMoney(cny, "CNY");
        var nzdText = formatMoney(nzd, "NZD");
        if (cny < 0) {
            cnyText = '<span class="text-danger">' + escapeHtml(cnyText) + "</span>";
        } else {
            cnyText = escapeHtml(cnyText);
        }
        if (nzd < 0) {
            nzdText = '<span class="text-danger">' + escapeHtml(nzdText) + "</span>";
        } else {
            nzdText = escapeHtml(nzdText);
        }
        return cnyText + " / " + nzdText;
    }

    function formatStudentMoney(user) {
        if (!user || user.role !== "STUDENT") {
            return "-";
        }
        return formatDualMoneyLine(user.prepaymentCny, user.prepaymentNzd);
    }

    function formatStudentBalance(user) {
        if (!user || user.role !== "STUDENT") {
            return "-";
        }
        return formatDualBalanceLine(user.balanceCny, user.balanceNzd);
    }

    function formatTimetableCourseLine(course) {
        if (!course) {
            return "";
        }
        var courseName = course.name || "";
        var t = course.teacher;
        if (t) {
            var u = String(t.username || "").trim();
            var n = String(t.name || "").trim();
            var teacherPart = u && n ? u + "/" + n : u || n;
            if (teacherPart) {
                return courseName + " (" + teacherPart + ")";
            }
        }
        return courseName;
    }

    function getLoggedOutItems() {
        return [
            '<li class="auth-menu-item"><a href="login.html">Login</a></li>'
            // ,
            // '<li class="auth-menu-item"><a href="register.html">Register</a></li>'
        ].join("");
    }

    function getHomePageByRole(user) {
        if (user && user.role === "ADMIN") {
            return "admin-users.html";
        }
        return "dashboard.html";
    }

    function getLoggedInItems(user) {
        var name = escapeHtml(getDisplayName(user));
        var home = getHomePageByRole(user);
        return [
            '<li class="auth-menu-item auth-user"><a href="javascript:void(0);">Hi, ' + name + "</a></li>",
            '<li class="auth-menu-item"><a href="' + home + '">My Account</a></li>',
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

    function parseApiErrorMessage(xhr, fallback) {
        var msg = fallback || "Request failed.";
        if (xhr && xhr.responseJSON && xhr.responseJSON.message != null) {
            msg = xhr.responseJSON.message;
        }
        if (Array.isArray(msg)) {
            msg = msg.join(", ");
        }
        return String(msg);
    }

    function showErrorAlert(message, title) {
        var text = message != null ? String(message) : "";
        if (!text) {
            return;
        }
        var heading = title || "Error";
        var $modal = $("#topedu-alert-modal");
        if (!$modal.length) {
            $("body").append(
                '<div class="modal fade" id="topedu-alert-modal" tabindex="-1" role="dialog">' +
                    '<div class="modal-dialog" role="document">' +
                        '<div class="modal-content">' +
                            '<div class="modal-header">' +
                                '<button type="button" class="close" data-dismiss="modal" aria-label="Close">' +
                                '<span aria-hidden="true">&times;</span></button>' +
                                '<h4 class="modal-title topedu-alert-title">Error</h4>' +
                            "</div>" +
                            '<div class="modal-body">' +
                                '<p class="topedu-alert-message" style="margin:0;white-space:pre-wrap;"></p>' +
                            "</div>" +
                            '<div class="modal-footer">' +
                                '<button type="button" class="btn btn-primary" data-dismiss="modal">OK</button>' +
                            "</div>" +
                        "</div>" +
                    "</div>" +
                "</div>"
            );
            $modal = $("#topedu-alert-modal");
        }
        $modal.find(".topedu-alert-title").text(heading);
        $modal.find(".topedu-alert-message").text(text);
        $modal.modal("show");
    }

    function showMessage($el, message, isError) {
        if (isError) {
            showErrorAlert(message || "");
            if ($el && $el.length) {
                $el.removeClass("success error").text("");
            }
            return;
        }
        if (!$el || !$el.length) {
            return;
        }
        $el.removeClass("success error");
        $el.addClass("success");
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

    function forgotPassword(payload) {
        return api.post("/auth/forgot-password", payload, { skipAuth: true }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function resetPassword(payload) {
        return api.post("/auth/reset-password", payload, { skipAuth: true }).then(function (response) {
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

    function changePassword(payload) {
        return api.post("/auth/change-password", payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getStudentTimetable() {
        return api.get("/student/timetable").then(function (response) {
            return normalizePayload(response);
        });
    }

    function getStudentWallet() {
        return api.get("/student/wallet").then(function (response) {
            return normalizePayload(response);
        });
    }

    function getStudentSessionList() {
        return api.get("/student/session-list");
    }

    function postStudentCheckIn(enrollmentId, dateStr) {
        return api.post("/student/check-in", { enrollmentId: enrollmentId, date: dateStr }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function postStudentLeave(enrollmentId, dateStr) {
        return api.post("/student/leave", { enrollmentId: enrollmentId, date: dateStr }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function createAdminUser(payload) {
        return api.post("/admin/users", payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUsers(params) {
        var query = {};
        if (params && typeof params === "string") {
            if ($.trim(params)) {
                query.email = $.trim(params);
            }
        } else if (params && typeof params === "object") {
            if ($.trim(params.email || "")) {
                query.email = $.trim(params.email);
            }
            if ($.trim(params.role || "")) {
                query.role = $.trim(params.role);
            }
        }
        return api.get("/admin/users", query).then(function (response) {
            return normalizePayload(response);
        });
    }

    function patchAdminUser(userId, payload) {
        return api.patch("/admin/users/" + encodeURIComponent(userId), payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function adminResetUserPassword(userId) {
        return api.post("/admin/users/" + encodeURIComponent(userId) + "/reset-password", {}).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUserEnrollmentSlots(userId) {
        return api.get("/admin/users/" + encodeURIComponent(userId) + "/enrollment-slots").then(function (response) {
            return normalizePayload(response);
        });
    }

    function putAdminUserEnrollmentSlots(userId, slotIds) {
        return api.put("/admin/users/" + encodeURIComponent(userId) + "/enrollment-slots", { slotIds: slotIds || [] }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUserDetail(userId) {
        return api.get("/admin/users/" + encodeURIComponent(userId)).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUserTimetableModules(userId) {
        return api.get("/admin/users/" + encodeURIComponent(userId) + "/timetable-modules").then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUserSessionList(userId) {
        return api.get("/admin/users/" + encodeURIComponent(userId) + "/session-list").then(function (response) {
            return normalizePayload(response);
        });
    }

    function postAdminUserRecharge(userId, payload) {
        return api
            .post("/admin/users/" + encodeURIComponent(userId) + "/recharge", payload)
            .then(function (response) {
                return normalizePayload(response);
            });
    }

    function postAdminUserRechargeReversal(userId, payload) {
        return api
            .post("/admin/users/" + encodeURIComponent(userId) + "/recharge-reversal", payload)
            .then(function (response) {
                return normalizePayload(response);
            });
    }

    function getAdminUserRechargeRecords(userId) {
        return api.get("/admin/users/" + encodeURIComponent(userId) + "/recharge-records").then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUserFinancialLedger(userId) {
        return api.get("/admin/users/" + encodeURIComponent(userId) + "/financial-ledger").then(function (response) {
            return normalizePayload(response);
        });
    }

    function postAdminUserCheckIn(userId, enrollmentId, date, currency) {
        var body = {
            enrollmentId: enrollmentId,
            date: date
        };
        if (currency) {
            body.currency = currency;
        }
        return api
            .post("/admin/users/" + encodeURIComponent(userId) + "/check-in", body)
            .then(function (response) {
                return normalizePayload(response);
            });
    }

    function postAdminUserLeave(userId, enrollmentId, date) {
        return api
            .post("/admin/users/" + encodeURIComponent(userId) + "/leave", {
                enrollmentId: enrollmentId,
                date: date
            })
            .then(function (response) {
                return normalizePayload(response);
            });
    }

    function approveSelection(selectionId) {
        return api.post("/admin/enrollments/" + encodeURIComponent(selectionId) + "/approve", {}).then(function (response) {
            return normalizePayload(response);
        });
    }

    function rejectSelection(selectionId) {
        return api.post("/admin/enrollments/" + encodeURIComponent(selectionId) + "/reject", {}).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminTimetable(weekOffset) {
        return api.get("/admin/timetable", { weekOffset: weekOffset }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function publishAdminTimetable(payload) {
        return api.post("/admin/timetable/publish", payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminTimetableModules() {
        return api.get("/admin/timetable-modules").then(function (response) {
            return normalizePayload(response);
        });
    }

    function createAdminTimetableModule(payload) {
        return api.post("/admin/timetable-modules", payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function updateAdminTimetableModule(moduleId, payload) {
        return api.patch("/admin/timetable-modules/" + encodeURIComponent(moduleId), payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function deleteAdminTimetableModule(moduleId) {
        return api.del("/admin/timetable-modules/" + encodeURIComponent(moduleId)).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminCourses() {
        return api.get("/admin/courses").then(function (response) {
            return normalizePayload(response);
        });
    }

    function createAdminCourse(payload) {
        return api.post("/admin/courses", payload).then(function (response) {
            return normalizePayload(response);
        });
    }

    function deleteAdminCourse(courseId) {
        return api.del("/admin/courses/" + encodeURIComponent(courseId)).then(function (response) {
            return normalizePayload(response);
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
                username: $.trim($("#login-username").val()),
                password: $("#login-password").val()
            };

            if (!data.username || !data.password) {
                showMessage($message, "Please fill in username and password.", true);
                return;
            }

            login(data)
                .done(function (payload) {
                    if (payload && payload.user && payload.user.mustChangePassword) {
                        showMessage($message, "First login detected. Please change your password.", false);
                        window.location.href = "change-password.html";
                        return;
                    }
                    showMessage($message, "Login successful, redirecting...", false);
                    window.location.href = getRedirectTarget(getHomePageByRole(payload.user || null));
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Login failed. Please check your credentials.";
                    showMessage($message, msg, true);
                });
        });
    }

    function bindChangePasswordForm() {
        var $form = $("#change-password-form");
        if (!$form.length) {
            return;
        }
        var $message = $("#auth-message");

        $form.on("submit", function (event) {
            event.preventDefault();
            var currentPassword = $("#current-password").val();
            var newPassword = $("#new-password").val();
            var confirmPassword = $("#confirm-new-password").val();

            if (!currentPassword || !newPassword || !confirmPassword) {
                showMessage($message, "Please fill in all password fields.", true);
                return;
            }
            if (newPassword.length < 8) {
                showMessage($message, "New password must be at least 8 characters.", true);
                return;
            }
            if (newPassword !== confirmPassword) {
                showMessage($message, "New passwords do not match.", true);
                return;
            }

            changePassword({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
                .done(function (payload) {
                    var user = getUser() || {};
                    user.mustChangePassword = false;
                    setUser(user);
                    showMessage($message, (payload && payload.message) || "Password changed successfully.", false);
                    window.setTimeout(function () {
                        var updatedUser = getUser() || {};
                        window.location.href = getHomePageByRole(updatedUser);
                    }, 1000);
                })
                .fail(function (xhr) {
                    showMessage($message, parseApiErrorMessage(xhr, "Failed to update password."), true);
                });
        });
    }

    function bindResetPasswordPage() {
        var $form = $("#reset-password-form");
        if (!$form.length) {
            return;
        }
        var $message = $("#auth-message");
        var $sendCodeBtn = $("#reset-password-send-code-btn");
        var countdownTimer = null;
        var countdownLeft = 0;
        var defaultBtnText = $.trim($sendCodeBtn.text()) || "Get code";

        function stopCountdown() {
            if (countdownTimer) {
                window.clearInterval(countdownTimer);
                countdownTimer = null;
            }
            countdownLeft = 0;
            $sendCodeBtn.prop("disabled", false).text(defaultBtnText);
        }

        function startCountdown(seconds) {
            stopCountdown();
            countdownLeft = seconds;
            $sendCodeBtn.prop("disabled", true).text(defaultBtnText + " (" + countdownLeft + "s)");
            countdownTimer = window.setInterval(function () {
                countdownLeft -= 1;
                if (countdownLeft <= 0) {
                    stopCountdown();
                    return;
                }
                $sendCodeBtn.text(defaultBtnText + " (" + countdownLeft + "s)");
            }, 1000);
        }

        function extractRetryAfterSeconds(xhr, payload) {
            var body = (xhr && xhr.responseJSON) || payload || {};
            var n = Number(body.retryAfterSeconds);
            return n > 0 ? Math.ceil(n) : 0;
        }

        $sendCodeBtn.on("click", function () {
            if ($sendCodeBtn.prop("disabled")) {
                return;
            }
            var email = $.trim($("#reset-password-email").val());
            if (!email) {
                showMessage($message, "Please enter your email first.", true);
                return;
            }

            forgotPassword({ email: email })
                .done(function (payload) {
                    var msg = (payload && payload.message) || "Verification code sent to your email.";
                    showMessage($message, msg, false);
                    var cooldown = extractRetryAfterSeconds(null, payload) || 60;
                    startCountdown(cooldown);
                })
                .fail(function (xhr) {
                    var body = xhr.responseJSON || {};
                    var msg = body.message || "Failed to send verification code.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                    var retry = extractRetryAfterSeconds(xhr);
                    if (retry > 0) {
                        startCountdown(retry);
                    }
                });
        });

        $form.on("submit", function (event) {
            event.preventDefault();
            var email = $.trim($("#reset-password-email").val());
            var code = $.trim($("#reset-password-code").val());
            var newPassword = $("#reset-password-new").val();
            var confirmPassword = $("#reset-password-confirm").val();

            if (!email || !code || !newPassword || !confirmPassword) {
                showMessage($message, "Please fill in all fields.", true);
                return;
            }
            if (!/^\d{6}$/.test(code)) {
                showMessage($message, "Please enter a valid 6-digit verification code.", true);
                return;
            }
            if (newPassword.length < 8) {
                showMessage($message, "Password must be at least 8 characters.", true);
                return;
            }
            if (newPassword !== confirmPassword) {
                showMessage($message, "Passwords do not match.", true);
                return;
            }

            resetPassword({
                email: email,
                code: code,
                newPassword: newPassword
            })
                .done(function (payload) {
                    var msg = (payload && payload.message) || "Password reset successful.";
                    showMessage($message, msg + " Redirecting to login...", false);
                    window.setTimeout(function () {
                        window.location.href = "login.html";
                    }, 1200);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to reset password.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });
    }

    function getSelectionBgColor(status) {
        if (status === "APPROVED") {
            return "#6cc070";
        }
        if (status === "PENDING") {
            return "#ffd24d";
        }
        return "#f7f7f7";
    }

    function renderModuleTables(containerSelector, payload, options) {
        var $container = $(containerSelector);
        if (!$container.length) {
            return;
        }
        var config = options || {};
        var modules = (payload && payload.modules) || [];
        var weekdays = (payload && payload.weekdays) || ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
        $container.empty();

        if (!modules.length) {
            $container.html('<p class="text-muted">' + escapeHtml(config.emptyMessage || "No timetable modules configured.") + "</p>");
            return;
        }

        modules.forEach(function (module) {
            var html = [];
            html.push('<div class="panel panel-default" style="margin-bottom:20px;">');
            html.push('<div class="panel-heading"><strong>' + escapeHtml(module.startDate || "") + ' ~ ' + escapeHtml(module.endDate || "") + '</strong></div>');
            html.push('<div class="panel-body">');
            html.push('<div class="table-responsive"><table class="table table-bordered">');
            html.push('<thead><tr><th>Time</th>');
            weekdays.forEach(function (day) {
                html.push('<th>' + escapeHtml(day) + '</th>');
            });
            html.push('</tr></thead><tbody>');

            (module.rows || []).forEach(function (row) {
                html.push('<tr>');
                html.push('<th>' + escapeHtml((row.startTime || "") + "-" + (row.endTime || "")) + '</th>');
                (row.cells || []).forEach(function (cell) {
                    var bg = getSelectionBgColor(cell.selectionStatus);
                    var actionHtml = "";
                    if (config.allowApprove && cell.selectionStatus === "PENDING" && cell.selectionId) {
                        actionHtml =
                            '<button class="btn btn-xs btn-success" data-approve-selection="' + escapeHtml(cell.selectionId) + '">Approve</button> ' +
                            '<button class="btn btn-xs btn-warning" data-reject-selection="' + escapeHtml(cell.selectionId) + '">Reject</button>';
                    } else if (config.allowSelect) {
                        var hasCourse = $.trim(cell.courseName || "").length > 0;
                        actionHtml = cell.selectionStatus
                            ? '<div style="font-size:12px;margin-top:6px;">' + escapeHtml(cell.selectionStatus) + '</div>'
                            : ((cell.slotId && hasCourse) ? '<button class="btn btn-xs btn-default" data-select-slot="' + escapeHtml(cell.slotId) + '">Select</button>' : '');
                    } else if (cell.selectionStatus) {
                        actionHtml = '<div style="font-size:12px;margin-top:6px;">' + escapeHtml(cell.selectionStatus) + '</div>';
                    }
                    html.push('<td style="background:' + bg + ';">' + escapeHtml(cell.courseName || "-") + '<br>' + actionHtml + '</td>');
                });
                html.push('</tr>');
            });
            html.push('</tbody></table></div>');
            html.push('</div></div>');
            $container.append(html.join(""));
        });
    }

    function renderWeekTable(containerSelector, weekData) {
        var $container = $(containerSelector);
        if (!$container.length || !weekData) {
            return;
        }

        var html = ['<table class="table table-bordered">'];
        html.push('<thead><tr><th>Time</th>');
        (weekData.weekdays || []).forEach(function (day) {
            html.push('<th>' + escapeHtml(day) + '</th>');
        });
        html.push('</tr></thead><tbody>');

        (weekData.rows || []).forEach(function (row) {
            html.push('<tr>');
            html.push('<th>' + escapeHtml(row.timeSlot) + '</th>');
            (row.cells || []).forEach(function (cell) {
                var bg = getSelectionBgColor(cell.selectionStatus);
                var button = cell.selectionStatus
                    ? '<div style="font-size:12px;margin-top:6px;">' + escapeHtml(cell.selectionStatus) + '</div>'
                    : '<button class="btn btn-xs btn-default" data-select-slot="' + escapeHtml(cell.slotId) + '">Select</button>';
                html.push('<td style="background:' + bg + ';">' + escapeHtml(cell.courseName || "-") + '<br>' + button + '</td>');
            });
            html.push('</tr>');
        });
        html.push('</tbody></table>');

        $container.html(html.join(""));
    }

    function studentCheckInWindowOpen(startMinute) {
        var now = new Date();
        var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        var winStart = day0.getTime() + Math.max(0, startMinute - 15) * 60 * 1000;
        var winEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
        var t = now.getTime();
        return t >= winStart && t <= winEnd;
    }

    function renderWalletStrip(wallet) {
        var $el = $("#student-wallet-strip");
        if (!$el.length) {
            return;
        }
        var prepCny = wallet && wallet.prepaymentCny != null ? Number(wallet.prepaymentCny) : 0;
        var prepNzd = wallet && wallet.prepaymentNzd != null ? Number(wallet.prepaymentNzd) : 0;
        var balCny = wallet && wallet.balanceCny != null ? Number(wallet.balanceCny) : 0;
        var balNzd = wallet && wallet.balanceNzd != null ? Number(wallet.balanceNzd) : 0;
        var feesCny = wallet && wallet.totalAttendanceFeesCny != null ? Number(wallet.totalAttendanceFeesCny) : 0;
        var feesNzd = wallet && wallet.totalAttendanceFeesNzd != null ? Number(wallet.totalAttendanceFeesNzd) : 0;
        var countCny = wallet && wallet.attendanceCountCny != null ? wallet.attendanceCountCny : 0;
        var countNzd = wallet && wallet.attendanceCountNzd != null ? wallet.attendanceCountNzd : 0;
        var balCnyClass = balCny < 0 ? "text-danger" : "text-green";
        var balNzdClass = balNzd < 0 ? "text-danger" : "text-green";
        $el.html(
            '<div class="panel panel-default" style="margin-bottom:16px;">' +
                '<div class="panel-body" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;font-size:15px;">' +
                '<div><strong>Prepayment (CNY)</strong> <span class="text-green">' +
                escapeHtml(formatMoney(prepCny, "CNY")) +
                "</span></div>" +
                '<div><strong>Prepayment (NZD)</strong> <span class="text-green">' +
                escapeHtml(formatMoney(prepNzd, "NZD")) +
                "</span></div>" +
                '<div><strong>Balance (CNY)</strong> <span class="' +
                balCnyClass +
                '">' +
                escapeHtml(formatMoney(balCny, "CNY")) +
                "</span></div>" +
                '<div><strong>Balance (NZD)</strong> <span class="' +
                balNzdClass +
                '">' +
                escapeHtml(formatMoney(balNzd, "NZD")) +
                "</span></div>" +
                '<span class="text-muted" style="font-size:12px;">Deducted: CNY ' +
                escapeHtml(formatMoney(feesCny, "CNY")) +
                " (" +
                escapeHtml(String(countCny)) +
                " sessions), NZD " +
                escapeHtml(formatMoney(feesNzd, "NZD")) +
                " (" +
                escapeHtml(String(countNzd)) +
                " sessions). Balance = prepayment − sign-in fees per currency.</span>" +
                "</div></div>"
        );
    }

    function sessionDisplayStatusLabel(st) {
        if (st === "attended") {
            return "Signed in";
        }
        if (st === "leave") {
            return "Leave";
        }
        if (st === "future") {
            return "Not started";
        }
        if (st === "today_open") {
            return "Not signed in";
        }
        return "Not signed in";
    }

    function sessionMatchesStatusFilter(st, filter) {
        if (!filter) {
            return true;
        }
        if (filter === "attended") {
            return st === "attended";
        }
        if (filter === "leave") {
            return st === "leave";
        }
        if (filter === "not_signed_in") {
            return st === "missed" || st === "today_open";
        }
        return true;
    }

    function buildAdminSessionActionCell(st, s) {
        if (st !== "missed" && st !== "today_open") {
            return '<span style="color:#bbb;">—</span>';
        }
        var dateStr = s.date || "";
        var eid = s.enrollmentId || "";
        if (!dateStr || !eid) {
            return '<span style="color:#bbb;">—</span>';
        }
        return (
            '<button type="button" class="btn btn-xs btn-success admin-session-checkin-btn" data-enrollment-id="' +
            escapeHtml(eid) +
            '" data-date="' +
            escapeHtml(dateStr) +
            '">Sign in</button> ' +
            '<button type="button" class="btn btn-xs btn-warning admin-session-leave-btn" data-enrollment-id="' +
            escapeHtml(eid) +
            '" data-date="' +
            escapeHtml(dateStr) +
            '">Leave</button>'
        );
    }

    function renderStudentSessionList(containerSelector, payload, options) {
        var config = options || {};
        var readOnly = !!config.readOnly;
        var adminActions = !!config.adminActions;
        var statusFilter = config.statusFilter || "";
        var $container = $(containerSelector);
        if (!$container.length) {
            return;
        }
        var raw = payload || {};
        if (raw.data && raw.data.sessions) {
            raw = raw.data;
        }
        var allSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
        var sessions = allSessions.filter(function (s) {
            return sessionMatchesStatusFilter(s.displayStatus, statusFilter);
        });
        var today = raw.today || null;
        var basePx = 14;
        var todayPx = basePx + 2;
        if (!allSessions.length) {
            $container.html(
                '<p class="text-muted">No sessions yet. When you are enrolled in timetable slots, each class date appears here.</p>'
            );
            return;
        }
        if (!sessions.length) {
            $container.html('<p class="text-muted">No records match the selected status filter.</p>');
            return;
        }
        var html = [];
        if (!readOnly) {
            html.push(
                '<p class="text-muted" style="font-size:13px;margin-bottom:12px;">' +
                    "<strong>Today</strong> is shown in <strong>black</strong> and larger type. Use <strong>Sign in</strong> / <strong>Leave</strong> here for today's classes.</p>"
            );
        }
        html.push('<div class="table-responsive"><table class="table table-bordered table-striped" style="font-size:' + basePx + 'px;">');
        html.push("<thead><tr>");
        html.push("<th>Date</th><th>Day</th><th>Time</th><th>Course</th>");
        if (readOnly) {
            html.push("<th>Fee (CNY)</th><th>Fee (NZD)</th><th>Status</th>");
            html.push("<th>Charged</th><th>Source</th><th>By</th><th>Reason</th>");
            if (adminActions) {
                html.push('<th style="text-align:center;">Action</th>');
            }
        } else {
            html.push('<th style="text-align:center;">Sign-in</th><th style="text-align:center;">Leave</th><th>Status</th>');
        }
        html.push("</tr></thead><tbody>");
        sessions.forEach(function (s) {
            var st = s.displayStatus;
            var isToday = today ? s.date === today.date : st === "today_open";
            var rowStyle =
                "font-size:" +
                (isToday ? todayPx : basePx) +
                "px;color:" +
                (isToday ? "#000" : "#777") +
                ";";
            if (!isToday && st === "future") {
                rowStyle += "background:#f9f9f9;";
            }
            var signCell = "";
            var leaveCell = "";
            var statusText = "";
            var actionDateStr = (today && today.date) || s.date || "";
            var startMin =
                s.startMinute != null
                    ? Number(s.startMinute)
                    : (function (t) {
                          if (!t || typeof t !== "string") {
                              return 0;
                          }
                          var p = t.split(":");
                          return Number(p[0]) * 60 + Number(p[1] || 0);
                      })(s.startTime);

            if (readOnly) {
                statusText = escapeHtml(sessionDisplayStatusLabel(st));
                if (st === "attended") {
                    statusText = '<span class="text-success">' + statusText + "</span>";
                } else if (st === "leave") {
                    statusText = '<span class="text-warning">' + statusText + "</span>";
                } else if (st === "future") {
                    statusText = '<span style="color:#999;">' + statusText + "</span>";
                } else {
                    statusText = '<span class="text-danger">' + statusText + "</span>";
                }
            } else if (st === "today_open" && actionDateStr) {
                var inWin = studentCheckInWindowOpen(startMin);
                signCell =
                    '<button type="button" class="btn btn-xs btn-success student-checkin-btn" data-enrollment-id="' +
                    escapeHtml(s.enrollmentId || "") +
                    '" data-today="' +
                    escapeHtml(actionDateStr) +
                    '"' +
                    (inWin ? "" : ' disabled="disabled"') +
                    ">Sign in</button>";
                if (!inWin) {
                    signCell +=
                        '<div class="text-muted" style="font-size:11px;margin-top:4px;">Opens 15 min before class</div>';
                }
                leaveCell =
                    '<button type="button" class="btn btn-xs btn-warning student-leave-btn" data-enrollment-id="' +
                    escapeHtml(s.enrollmentId || "") +
                    '" data-today="' +
                    escapeHtml(actionDateStr) +
                    '">Leave</button>';
                statusText = '<span style="color:#555;">Open — sign in or leave</span>';
            } else if (st === "future") {
                signCell = '<span style="color:#bbb;">—</span>';
                leaveCell = '<span style="color:#bbb;">—</span>';
                statusText = '<span style="color:#999;">Upcoming</span>';
            } else if (st === "attended") {
                signCell =
                    '<span class="text-success" title="Signed in" style="display:inline-block;font-size:22px;font-weight:700;line-height:1;">✓</span>';
                leaveCell = '<span style="color:#ccc;">—</span>';
                statusText = '<span class="text-success">Signed in</span>';
            } else if (st === "leave") {
                signCell = '<span style="color:#ccc;">—</span>';
                leaveCell = '<span class="text-warning" title="Leave recorded"><i class="fa fa-check"></i></span>';
                statusText = '<span class="text-warning">Leave recorded</span>';
            } else {
                signCell = '<span class="text-danger" title="Missed sign-in"><i class="fa fa-times"></i></span>';
                leaveCell = '<span style="color:#ccc;">—</span>';
                statusText = '<span class="text-danger">Missed sign-in</span>';
            }
            html.push('<tr style="' + rowStyle + '">');
            html.push("<td>" + escapeHtml(s.date || "") + "</td>");
            html.push("<td>" + escapeHtml(s.weekdayLabel || "") + "</td>");
            html.push(
                "<td>" + escapeHtml(s.startTime || "") + "–" + escapeHtml(s.endTime || "") + "</td>"
            );
            html.push("<td>" + escapeHtml(s.courseLabel || "") + "</td>");
            if (readOnly) {
                html.push("<td>" + escapeHtml(formatMoney(s.feeCny != null ? s.feeCny : 0, "CNY")) + "</td>");
                html.push("<td>" + escapeHtml(formatMoney(s.feeNzd != null ? s.feeNzd : 0, "NZD")) + "</td>");
                html.push("<td>" + statusText + "</td>");
                var att = s.attendance || null;
                if (att && st === "attended") {
                    html.push(
                        "<td>" +
                            escapeHtml(formatMoney(att.feeDeducted, att.currency)) +
                            " (" +
                            escapeHtml(att.currency || "") +
                            ")</td>"
                    );
                    html.push("<td>" + escapeHtml(recordSourceLabel(att.recordSource)) + "</td>");
                    html.push(
                        "<td>" +
                            escapeHtml(
                                att.createdBy ? att.createdBy.name || att.createdBy.username || "—" : "—"
                            ) +
                            "</td>"
                    );
                    html.push(
                        '<td title="' +
                            escapeHtml(billingReasonLabel(att.billingSelectionReason)) +
                            '">' +
                            escapeHtml(billingReasonLabel(att.billingSelectionReason)) +
                            "</td>"
                    );
                } else {
                    html.push("<td>—</td><td>—</td><td>—</td><td>—</td>");
                }
                if (adminActions) {
                    html.push(
                        '<td style="text-align:center;vertical-align:middle;">' +
                            buildAdminSessionActionCell(st, s) +
                            "</td>"
                    );
                }
            } else {
                html.push('<td style="text-align:center;vertical-align:middle;">' + signCell + "</td>");
                html.push('<td style="text-align:center;vertical-align:middle;">' + leaveCell + "</td>");
                html.push("<td>" + statusText + "</td>");
            }
            html.push("</tr>");
        });
        html.push("</tbody></table></div>");
        $container.html(html.join(""));
    }

    function bindStudentDashboardPage() {
        var $section = $("#student-dashboard");
        if (!$section.length) {
            return;
        }
        var $message = $("#dashboard-message");
        var dashboardPollTimer = null;

        function refreshTimetableAndSessions() {
            getStudentTimetable()
                .done(function (timetable) {
                    renderModuleTables("#student-modules", normalizePayload(timetable), {
                        emptyMessage:
                            "No enrolled courses yet. Your administrator will assign timetable slots to your account."
                    });
                })
                .fail(function () {});
            getStudentSessionList()
                .done(function (data) {
                    renderStudentSessionList("#student-session-list", normalizePayload(data));
                })
                .fail(function () {});
        }

        function startDashboardPolling() {
            stopDashboardPolling();
            dashboardPollTimer = window.setInterval(function () {
                if (!$("#student-dashboard").length) {
                    stopDashboardPolling();
                    return;
                }
                refreshTimetableAndSessions();
            }, 30000);
        }

        function stopDashboardPolling() {
            if (dashboardPollTimer) {
                window.clearInterval(dashboardPollTimer);
                dashboardPollTimer = null;
            }
        }

        function load() {
            getStudentWallet()
                .done(function (wallet) {
                    renderWalletStrip(wallet || {});
                })
                .fail(function () {
                    $("#student-wallet-strip").empty();
                });
            getStudentTimetable()
                .done(function (timetable) {
                    renderModuleTables("#student-modules", timetable || {}, {
                        emptyMessage:
                            "No enrolled courses yet. Your administrator will assign timetable slots to your account."
                    });
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load timetable.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
            getStudentSessionList()
                .done(function (data) {
                    renderStudentSessionList("#student-session-list", normalizePayload(data));
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Could not load the session list."));
                    $("#student-session-list").html(
                        '<p class="text-muted">Could not load the session list.</p>'
                    );
                });
        }

        $('a[href="#student-tab-sessions"]')
            .off("shown.bs.tab.studentSessions")
            .on("shown.bs.tab.studentSessions", function () {
                refreshTimetableAndSessions();
            });

        $(document)
            .off("visibilitychange.studentDashboard")
            .on("visibilitychange.studentDashboard", function () {
                if (document.visibilityState === "visible" && $("#student-dashboard").length) {
                    refreshTimetableAndSessions();
                    getStudentWallet()
                        .done(function (wallet) {
                            renderWalletStrip(wallet || {});
                        })
                        .fail(function () {});
                }
            });

        $(window)
            .off("beforeunload.studentDashboard")
            .on("beforeunload.studentDashboard", stopDashboardPolling);

        $section.on("click", ".student-checkin-btn", function () {
            var $btn = $(this);
            if ($btn.prop("disabled")) {
                return;
            }
            var enrollmentId = $btn.attr("data-enrollment-id");
            var todayStr = $btn.attr("data-today");
            if (!enrollmentId || !todayStr) {
                return;
            }
            $btn.prop("disabled", true);
            postStudentCheckIn(enrollmentId, todayStr)
                .done(function (payload) {
                    var rest = payload && payload.remainingBalance != null ? payload.remainingBalance : "";
                    var currency = payload && payload.currency ? payload.currency : null;
                    showMessage(
                        $message,
                        "Signed in for " +
                            todayStr +
                            "." +
                            (payload && payload.feeDeducted != null && payload.currency
                                ? " Charged " +
                                  formatMoney(payload.feeDeducted, payload.currency) +
                                  " (" +
                                  payload.currency +
                                  ")."
                                : "") +
                            (rest !== ""
                                ? " Remaining balance: " + formatMoney(rest, currency)
                                : ""),
                        false
                    );
                    load();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Sign-in failed";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                    $btn.prop("disabled", false);
                });
        });

        $section.on("click", ".student-leave-btn", function () {
            var $btn = $(this);
            var enrollmentId = $btn.attr("data-enrollment-id");
            var todayStr = $btn.attr("data-today");
            if (!enrollmentId || !todayStr) {
                return;
            }
            if (!window.confirm("Record leave for " + todayStr + "? (Applies to today only.)")) {
                return;
            }
            $btn.prop("disabled", true);
            postStudentLeave(enrollmentId, todayStr)
                .done(function () {
                    showMessage($message, "Leave recorded for " + todayStr + ".", false);
                    load();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Leave request failed";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                })
                .always(function () {
                    $btn.prop("disabled", false);
                });
        });

        load();
        startDashboardPolling();
    }

    function bindAdminUsersPage() {
        var $section = $("#admin-users-page");
        if (!$section.length) {
            return;
        }
        var $tableBody = $("#admin-users-body");
        var $search = $("#admin-search-email");
        var $message = $("#admin-users-message");
        var usersListCache = [];

        function genderLabel(val) {
            if (val === "MALE") return "Male";
            if (val === "FEMALE") return "Female";
            return "-";
        }

        function filterUsersByEmail(users, emailQuery) {
            var q = $.trim(emailQuery || "").toLowerCase();
            if (!q) {
                return users || [];
            }
            return (users || []).filter(function (user) {
                var email = String(user.email || "").toLowerCase();
                var username = String(user.username || "").toLowerCase();
                var name = String(user.name || "").toLowerCase();
                return email.indexOf(q) >= 0 || username.indexOf(q) >= 0 || name.indexOf(q) >= 0;
            });
        }

        function renderUsers(users) {
            usersListCache = users || [];
            $("#admin-users-filter-count").text("(" + usersListCache.length + " records)");
            $tableBody.empty();
            if (!users || !users.length) {
                $tableBody.append('<tr><td colspan="8">No users found.</td></tr>');
                return;
            }
            users.forEach(function (user) {
                var prepayText = user.role === "STUDENT" ? escapeHtml(formatStudentMoney(user)) : "-";
                var balanceText = user.role === "STUDENT" ? formatStudentBalance(user) : "-";
                var emailText = user.email ? escapeHtml(user.email) : "-";
                var coursesBtn =
                    user.role === "STUDENT"
                        ? '<button type="button" class="btn btn-xs btn-primary admin-enroll-courses" data-user-id="' +
                          escapeHtml(user.id) +
                          '">Enroll</button> '
                        : "";
                var recordsBtn =
                    user.role === "STUDENT"
                        ? '<button type="button" class="btn btn-xs btn-info admin-view-records" data-user-id="' +
                          escapeHtml(user.id) +
                          '">Attendance</button> '
                        : "";
                var rechargeBtn =
                    user.role === "STUDENT"
                        ? '<button type="button" class="btn btn-xs btn-success admin-recharge-user" data-user-id="' +
                          escapeHtml(user.id) +
                          '">Recharge</button> '
                        : "";
                var viewBtn =
                    '<button type="button" class="btn btn-xs btn-info admin-view-user" data-user-id="' +
                    escapeHtml(user.id) +
                    '">View</button> ';
                var resetPwdBtn =
                    '<button type="button" class="btn btn-xs btn-warning admin-reset-password" data-user-id="' +
                    escapeHtml(user.id) +
                    '" data-user-name="' +
                    escapeHtml(user.name || user.username || "") +
                    '">Reset Pwd</button> ';
                var row = [
                    "<tr>",
                    "<td>" + escapeHtml(user.username || "") + "</td>",
                    "<td>" + escapeHtml(user.name || "") + "</td>",
                    "<td>" + emailText + "</td>",
                    "<td>" + escapeHtml(user.role || "") + "</td>",
                    "<td>" + genderLabel(user.gender) + "</td>",
                    "<td>" + prepayText + "</td>",
                    "<td>" + balanceText + "</td>",
                    '<td class="admin-users-actions-col"><div class="admin-users-actions">' +
                        viewBtn +
                        // resetPwdBtn +
                        rechargeBtn +
                        coursesBtn +
                        recordsBtn +
                        "</div></td>",
                    "</tr>"
                ].join("");
                $tableBody.append(row);
            });
        }

        function loadUsers() {
            var role = $("#admin-role-filter").val() || "";
            getAdminUsers({ email: $.trim($search.val() || ""), role: role })
                .done(function (payload) {
                    var users = filterUsersByEmail(payload.users || [], $search.val());
                    renderUsers(users);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load users.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        var searchDebounceTimer = null;
        $search.on("input", function () {
            window.clearTimeout(searchDebounceTimer);
            searchDebounceTimer = window.setTimeout(function () {
                loadUsers();
            }, 300);
        });

        $("#admin-role-filter").on("change", function () {
            loadUsers();
        });

        var $modal = $("#create-user-modal");
        var $cuRole = $("#cu-role");
        var $cuMessage = $("#create-user-message");

        $modal.on("hidden.bs.modal", function () {
            $("#create-user-form")[0].reset();
            $cuMessage.text("").removeClass("success error");
        });

        $section.on("click", ".admin-view-user", function () {
            var uid = $(this).attr("data-user-id");
            if (uid) {
                window.location.href = "admin-user-detail.html?userId=" + encodeURIComponent(uid);
            }
        });

        $section.on("click", ".admin-reset-password", function () {
            var uid = $(this).attr("data-user-id");
            var userName = $(this).attr("data-user-name") || "this user";
            if (!uid) {
                return;
            }
            if (
                !window.confirm(
                    "Reset password for " +
                        userName +
                        " to the default (12345678)?\nThe user must change password on next login."
                )
            ) {
                return;
            }
            var $btn = $(this);
            $btn.prop("disabled", true);
            adminResetUserPassword(uid)
                .done(function (payload) {
                    showMessage($message, (payload && payload.message) || "Password reset successfully.", false);
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to reset password."));
                })
                .always(function () {
                    $btn.prop("disabled", false);
                });
        });

        $("#create-user-submit").on("click", function () {
            var username = $.trim($("#cu-username").val());
            var name = $.trim($("#cu-name").val());
            var email = $.trim($("#cu-email").val());
            var gender = $("#cu-gender").val();
            var role = $cuRole.val();

            if (!username || !name) {
                showMessage($cuMessage, "Please fill in username and name.", true);
                return;
            }
            if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                showMessage($cuMessage, "Username can only contain letters, numbers, and underscores.", true);
                return;
            }

            var payload = {
                username: username,
                name: name,
                role: role
            };
            if (email) {
                payload.email = email;
            }
            if (gender) {
                payload.gender = gender;
            }

            $("#create-user-submit").prop("disabled", true).text("Saving...");

            createAdminUser(payload)
                .done(function (result) {
                    showMessage($cuMessage, "Account created! Default password: 12345678 (must change on first login)", false);
                    window.setTimeout(function () {
                        $modal.modal("hide");
                        loadUsers();
                    }, 800);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to create account.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($cuMessage, msg, true);
                })
                .always(function () {
                    $("#create-user-submit").prop("disabled", false).text("Save");
                });
        });

        var $enrollmentModal = $("#student-enrollment-modal");
        var $recordsModal = $("#student-session-records-modal");
        var sessionRecordsCache = null;
        var sessionRecordsUserId = null;
        var dayHeadersShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

        function firstJqResolvedArg(maybeTuple) {
            if (Array.isArray(maybeTuple) && maybeTuple.length && maybeTuple[0] != null) {
                return maybeTuple[0];
            }
            return maybeTuple;
        }

        function normalizeSlotIdList(raw) {
            var arr;
            if (Array.isArray(raw)) {
                arr = raw;
            } else if (raw && typeof raw === "object") {
                if (Array.isArray(raw.slotIds)) {
                    arr = raw.slotIds;
                } else if (raw.data && Array.isArray(raw.data.slotIds)) {
                    arr = raw.data.slotIds;
                } else {
                    arr = [];
                }
            } else {
                arr = [];
            }
            if (!Array.isArray(arr)) {
                return [];
            }
            return arr
                .map(function (id) {
                    return String(id == null ? "" : id).trim();
                })
                .filter(Boolean);
        }

        function renderEnrollmentModules(modulesPayload, selectedSlotIds) {
            var modules = (modulesPayload && modulesPayload.modules) || [];
            var selectedSet = {};
            normalizeSlotIdList(selectedSlotIds).forEach(function (id) {
                selectedSet[id] = true;
            });
            var html = [];
            if (!modules.length) {
                return '<p class="text-muted">No timetable modules. Add modules in the Timetable Editor tab first.</p>';
            }
            modules.forEach(function (mod) {
                var rows = slotsToSlotRows(mod.slots || []);
                html.push('<div class="panel panel-default" style="margin-bottom:16px;">');
                html.push(
                    '<div class="panel-heading" style="padding:10px 15px;"><strong>' +
                        escapeHtml(mod.startDate || "") +
                        " ~ " +
                        escapeHtml(mod.endDate || "") +
                        "</strong></div>"
                );
                html.push('<div class="panel-body" style="padding:0;">');
                if (!rows.length) {
                    html.push('<p class="text-muted" style="padding:12px;margin:0;">No slots in this date range.</p>');
                } else {
                    html.push('<div class="table-responsive admin-enrollment-table-wrap"><table class="table table-bordered" style="margin:0;">');
                    html.push("<thead><tr><th>Start</th><th>End</th>");
                    dayHeadersShort.forEach(function (dh) {
                        html.push("<th>" + dh + "</th>");
                    });
                    html.push("</tr></thead><tbody>");
                    rows.forEach(function (row) {
                        html.push("<tr>");
                        html.push("<td>" + escapeHtml(row.startTime) + "</td>");
                        html.push("<td>" + escapeHtml(row.endTime) + "</td>");
                        row.days.forEach(function (entries) {
                            html.push('<td style="vertical-align:middle;min-width:160px;">');
                            if (entries && entries.length) {
                                var preselected = "";
                                entries.forEach(function (entry) {
                                    var eid = String(entry.slotId == null ? "" : entry.slotId).trim();
                                    if (eid && selectedSet[eid] && !preselected) {
                                        preselected = eid;
                                    }
                                });
                                html.push(
                                    '<select class="form-control input-sm admin-enroll-slot-select" style="max-width:100%;" title="Pick one course or leave empty">'
                                );
                                html.push('<option value="">' + escapeHtml("— None —") + "</option>");
                                entries.forEach(function (entry) {
                                    var label = formatTimetableCourseLine(entry.course);
                                    var eid = String(entry.slotId == null ? "" : entry.slotId).trim();
                                    var sel = preselected === eid ? ' selected="selected"' : "";
                                    html.push(
                                        '<option value="' +
                                            escapeHtml(eid) +
                                            '"' +
                                            sel +
                                            ">" +
                                            escapeHtml(label) +
                                            "</option>"
                                    );
                                });
                                html.push("</select>");
                            } else {
                                html.push('<span class="text-muted">—</span>');
                            }
                            html.push("</td>");
                        });
                        html.push("</tr>");
                    });
                    html.push("</tbody></table></div>");
                }
                html.push("</div></div>");
            });
            return html.join("");
        }

        $section.on("click", ".admin-enroll-courses", function () {
            var userId = $(this).attr("data-user-id");
            var user = usersListCache.find(function (u) {
                return String(u.id) === String(userId);
            });
            if (!userId || !user) {
                return;
            }
            $("#enrollment-user-id").val(userId);
            $("#enrollment-user-label").text("Student: " + (user.name || "") + " (" + (user.username || "") + ")");
            $("#student-enrollment-message").text("").removeClass("success error");
            $("#student-enrollment-modules").html('<p class="text-muted">Loading...</p>');
            $enrollmentModal.modal("show");
            getAdminTimetableModules()
                .done(function (modResolved) {
                    var modPayload = normalizePayload(firstJqResolvedArg(modResolved));
                    getAdminUserEnrollmentSlots(userId)
                        .done(function (slotResolved) {
                            var slotPayload = normalizePayload(firstJqResolvedArg(slotResolved));
                            var selectedIds = normalizeSlotIdList(slotPayload);
                            $("#student-enrollment-modules").html(renderEnrollmentModules(modPayload, selectedIds));
                        })
                        .fail(function (xhr) {
                            showErrorAlert(parseApiErrorMessage(xhr, "Failed to load enrollments."));
                            $("#student-enrollment-modules").html(
                                '<p class="text-muted">Could not load enrollment data.</p>'
                            );
                        });
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to load timetable."));
                    $("#student-enrollment-modules").html(
                        '<p class="text-muted">Could not load timetable modules.</p>'
                    );
                });
        });

        function countSessionsForFilter(allSessions, statusFilter) {
            if (!Array.isArray(allSessions)) {
                return 0;
            }
            return allSessions.filter(function (s) {
                return sessionMatchesStatusFilter(s.displayStatus, statusFilter);
            }).length;
        }

        function renderAdminSessionRecords() {
            if (!sessionRecordsCache) {
                return;
            }
            var statusFilter = $("#session-records-status-filter").val() || "";
            var raw = sessionRecordsCache;
            if (raw.data && raw.data.sessions) {
                raw = raw.data;
            }
            var allSessions = Array.isArray(raw.sessions) ? raw.sessions : [];
            var count = countSessionsForFilter(allSessions, statusFilter);
            $("#session-records-filter-count").text("(" + count + " records)");
            renderStudentSessionList("#student-session-records-body", sessionRecordsCache, {
                readOnly: true,
                adminActions: true,
                statusFilter: statusFilter
            });
        }

        function reloadSessionRecordsAfterAction() {
            if (!sessionRecordsUserId) {
                return;
            }
            var $msg = $("#student-session-records-message");
            getAdminUserSessionList(sessionRecordsUserId)
                .done(function (payload) {
                    sessionRecordsCache = payload;
                    renderAdminSessionRecords();
                    loadUsers();
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to reload class records."));
                });
        }

        $recordsModal.on("click", ".admin-session-checkin-btn", function () {
            if (!sessionRecordsUserId) {
                return;
            }
            var $btn = $(this);
            var enrollmentId = $.trim($btn.attr("data-enrollment-id") || "");
            var date = $.trim($btn.attr("data-date") || "");
            if (!enrollmentId || !date) {
                return;
            }
            var $msg = $("#student-session-records-message");
            $msg.text("").removeClass("success error");
            $btn.prop("disabled", true);
            postAdminUserCheckIn(sessionRecordsUserId, enrollmentId, date)
                .done(function (result) {
                    var bal =
                        result && result.remainingBalance != null
                            ? formatMoney(result.remainingBalance, result.currency || "")
                            : "";
                    var fee =
                        result && result.feeDeducted != null
                            ? formatMoney(result.feeDeducted, result.currency || "")
                            : "";
                    var msg = "Signed in.";
                    if (fee && result.currency) {
                        msg += " Charged " + fee + " (" + result.currency + ").";
                    }
                    if (bal) {
                        msg += " Remaining balance: " + bal + ".";
                    }
                    $msg.text(msg).removeClass("error").addClass("success");
                    reloadSessionRecordsAfterAction();
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Check-in failed."));
                })
                .always(function () {
                    $btn.prop("disabled", false);
                });
        });

        $recordsModal.on("click", ".admin-session-leave-btn", function () {
            if (!sessionRecordsUserId) {
                return;
            }
            var $btn = $(this);
            var enrollmentId = $.trim($btn.attr("data-enrollment-id") || "");
            var date = $.trim($btn.attr("data-date") || "");
            if (!enrollmentId || !date) {
                return;
            }
            var $msg = $("#student-session-records-message");
            $msg.text("").removeClass("success error");
            $btn.prop("disabled", true);
            postAdminUserLeave(sessionRecordsUserId, enrollmentId, date)
                .done(function () {
                    $msg.text("Leave recorded.").removeClass("error").addClass("success");
                    reloadSessionRecordsAfterAction();
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Leave request failed."));
                })
                .always(function () {
                    $btn.prop("disabled", false);
                });
        });

        $("#session-records-status-filter").on("change", function () {
            renderAdminSessionRecords();
        });

        $recordsModal.on("hidden.bs.modal", function () {
            sessionRecordsCache = null;
            sessionRecordsUserId = null;
            $("#session-records-status-filter").val("");
            $("#session-records-filter-count").text("");
        });

        $section.on("click", ".admin-view-records", function () {
            var userId = $(this).attr("data-user-id");
            var user = usersListCache.find(function (u) {
                return String(u.id) === String(userId);
            });
            if (!userId || !user) {
                return;
            }
            sessionRecordsUserId = userId;
            $("#session-records-user-label").text(
                "Student: " + (user.name || "") + " (" + (user.username || "") + ")"
            );
            $("#student-session-records-message").text("").removeClass("success error");
            $("#session-records-status-filter").val("");
            $("#session-records-filter-count").text("");
            $("#student-session-records-body").html('<p class="text-muted">Loading...</p>');
            $recordsModal.modal("show");
            getAdminUserSessionList(userId)
                .done(function (payload) {
                    sessionRecordsCache = payload;
                    renderAdminSessionRecords();
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to load class records."));
                    $("#student-session-records-body").html(
                        '<p class="text-muted">Could not load class records.</p>'
                    );
                });
        });

        var $rechargeModal = $("#student-recharge-modal");

        function formatRecordDateTime(iso) {
            if (!iso) {
                return "—";
            }
            try {
                var d = new Date(iso);
                if (isNaN(d.getTime())) {
                    return String(iso);
                }
                return d.toLocaleString();
            } catch (e) {
                return String(iso);
            }
        }

        function renderRechargeRecords(payload) {
            var raw = payload || {};
            if (raw.data && raw.data.records) {
                raw = raw.data;
            }
            var batches = Array.isArray(raw.batches) ? raw.batches : [];
            if (!batches.length) {
                var records = Array.isArray(raw.records) ? raw.records : [];
                if (!records.length) {
                    $("#recharge-records-body").html('<p class="text-muted">No recharge records yet.</p>');
                    return;
                }
                var byBatch = {};
                records.forEach(function (r) {
                    var key = r.batchId || "legacy:" + r.id;
                    if (!byBatch[key]) {
                        byBatch[key] = {
                            batchId: r.batchId || null,
                            createdAt: r.createdAt,
                            amountCny: null,
                            amountNzd: null,
                            prepaymentCnyAfter: null,
                            prepaymentNzdAfter: null,
                            balanceCnyAfter: r.balanceCnyAfter != null ? r.balanceCnyAfter : null,
                            balanceNzdAfter: r.balanceNzdAfter != null ? r.balanceNzdAfter : null,
                            note: r.note,
                            createdBy: r.createdBy || null,
                            recordSource: r.recordSource,
                            recordType: r.recordType || "RECHARGE",
                            relatedBatchId: r.relatedBatchId || null
                        };
                    }
                    if (r.currency === "CNY") {
                        byBatch[key].amountCny = r.amount;
                        byBatch[key].prepaymentCnyAfter = r.prepaymentAfter;
                    } else if (r.currency === "NZD") {
                        byBatch[key].amountNzd = r.amount;
                        byBatch[key].prepaymentNzdAfter = r.prepaymentAfter;
                    }
                });
                batches = Object.keys(byBatch).map(function (k) {
                    return byBatch[k];
                });
                batches.sort(function (a, b) {
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
            }
            if (!batches.length) {
                $("#recharge-records-body").html('<p class="text-muted">No recharge records yet.</p>');
                return;
            }
            var html = [];
            html.push(
                '<div class="table-responsive"><table class="table table-bordered table-striped" style="font-size:13px;margin-bottom:0;">'
            );
            html.push(
                "<thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Prepayment after</th><th>Balance after</th><th>By</th><th>Note</th></tr></thead><tbody>"
            );
            batches.forEach(function (b) {
                var by = b.createdBy ? escapeHtml(b.createdBy.name || b.createdBy.username || "—") : "—";
                var reversal = isRechargeBatchReversal(b);
                var typeLabel = reversal ? "Reversal" : "Recharge";
                html.push("<tr>");
                html.push("<td>" + escapeHtml(formatRecordDateTime(b.createdAt)) + "</td>");
                html.push("<td>" + escapeHtml(typeLabel) + "</td>");
                html.push("<td>" + escapeHtml(formatRechargeBatchAmount(b)) + "</td>");
                html.push("<td>" + escapeHtml(formatRechargeBatchPrepayment(b)) + "</td>");
                html.push("<td>" + formatRechargeBatchBalance(b) + "</td>");
                html.push("<td>" + by + "</td>");
                html.push("<td>" + escapeHtml(b.note || "—") + "</td>");
                html.push("</tr>");
            });
            html.push("</tbody></table></div>");
            $("#recharge-records-body").html(html.join(""));
        }

        function loadRechargeRecords(userId) {
            $("#recharge-records-body").html('<p class="text-muted">Loading...</p>');
            getAdminUserRechargeRecords(userId)
                .done(function (payload) {
                    renderRechargeRecords(payload);
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to load recharge history."));
                    $("#recharge-records-body").html(
                        '<p class="text-muted">Could not load recharge history.</p>'
                    );
                });
        }

        $rechargeModal.on("hidden.bs.modal", function () {
            $("#recharge-user-id").val("");
            $("#recharge-amount-cny").val("");
            $("#recharge-amount-nzd").val("");
            $("#recharge-note").val("");
            $("#reversal-amount-cny").val("");
            $("#reversal-amount-nzd").val("");
            $("#reversal-note").val("");
            $("#reversal-related-batch-id").val("");
            $("#student-recharge-message").text("").removeClass("success error");
            $("#student-reversal-message").text("").removeClass("success error");
            $("#recharge-records-body").html("");
        });

        $section.on("click", ".admin-recharge-user", function () {
            var userId = $(this).attr("data-user-id");
            var user = usersListCache.find(function (u) {
                return String(u.id) === String(userId);
            });
            if (!userId || !user) {
                return;
            }
            $("#recharge-user-id").val(userId);
            $("#recharge-user-label").text("Student: " + (user.name || "") + " (" + (user.username || "") + ")");
            $("#recharge-wallet-label").text(
                "Prepayment: " +
                    formatStudentMoney(user) +
                    " · Balance: " +
                    formatDualMoneyLine(user.balanceCny, user.balanceNzd)
            );
            $("#recharge-amount-cny").val("");
            $("#recharge-amount-nzd").val("");
            $("#recharge-note").val("");
            $("#reversal-amount-cny").val("");
            $("#reversal-amount-nzd").val("");
            $("#reversal-note").val("");
            $("#reversal-related-batch-id").val("");
            $("#student-recharge-message").text("").removeClass("success error");
            $("#student-reversal-message").text("").removeClass("success error");
            $rechargeModal.modal("show");
            loadRechargeRecords(userId);
        });

        $("#student-recharge-submit").on("click", function () {
            var userId = $.trim($("#recharge-user-id").val());
            var amountCnyRaw = $.trim($("#recharge-amount-cny").val());
            var amountNzdRaw = $.trim($("#recharge-amount-nzd").val());
            var amountCny = amountCnyRaw === "" ? null : parseFloat(amountCnyRaw);
            var amountNzd = amountNzdRaw === "" ? null : parseFloat(amountNzdRaw);
            var note = $.trim($("#recharge-note").val());
            var $msg = $("#student-recharge-message");
            if (!userId) {
                return;
            }
            var hasCny = amountCny != null && !isNaN(amountCny) && amountCny >= 0.01;
            var hasNzd = amountNzd != null && !isNaN(amountNzd) && amountNzd >= 0.01;
            if (!hasCny && !hasNzd) {
                showMessage($msg, "Enter at least one recharge amount (CNY or NZD).", true);
                return;
            }
            if (amountCny != null && (isNaN(amountCny) || amountCny < 0)) {
                showMessage($msg, "CNY amount must be zero or greater.", true);
                return;
            }
            if (amountNzd != null && (isNaN(amountNzd) || amountNzd < 0)) {
                showMessage($msg, "NZD amount must be zero or greater.", true);
                return;
            }
            var payload = {};
            if (hasCny) {
                payload.amountCny = amountCny;
            }
            if (hasNzd) {
                payload.amountNzd = amountNzd;
            }
            if (note) {
                payload.note = note;
            }
            var $btn = $("#student-recharge-submit");
            $btn.prop("disabled", true).text("Processing...");
            $msg.text("").removeClass("success error");
            postAdminUserRecharge(userId, payload)
                .done(function (result) {
                    showMessage(
                        $msg,
                        "Recharged successfully. Prepayment: " +
                            formatDualMoneyLine(result.prepaymentCny, result.prepaymentNzd) +
                            " · Balance: " +
                            formatDualMoneyLine(result.balanceCny, result.balanceNzd),
                        false
                    );
                    $("#recharge-amount-cny").val("");
                    $("#recharge-amount-nzd").val("");
                    $("#recharge-note").val("");
                    loadRechargeRecords(userId);
                    loadUsers();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Recharge failed.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($msg, msg, true);
                })
                .always(function () {
                    $btn.prop("disabled", false).text("Recharge");
                });
        });

        $("#student-recharge-reverse-submit").on("click", function () {
            var userId = $.trim($("#recharge-user-id").val());
            var amountCnyRaw = $.trim($("#reversal-amount-cny").val());
            var amountNzdRaw = $.trim($("#reversal-amount-nzd").val());
            var amountCny = amountCnyRaw === "" ? null : parseFloat(amountCnyRaw);
            var amountNzd = amountNzdRaw === "" ? null : parseFloat(amountNzdRaw);
            var note = $.trim($("#reversal-note").val());
            var relatedBatchId = $.trim($("#reversal-related-batch-id").val());
            var $msg = $("#student-reversal-message");
            if (!userId) {
                return;
            }
            var hasCny = amountCny != null && !isNaN(amountCny) && amountCny >= 0.01;
            var hasNzd = amountNzd != null && !isNaN(amountNzd) && amountNzd >= 0.01;
            if (!hasCny && !hasNzd) {
                showMessage($msg, "Enter at least one reversal amount (CNY or NZD).", true);
                return;
            }
            if (amountCny != null && (isNaN(amountCny) || amountCny < 0)) {
                showMessage($msg, "CNY amount must be zero or greater.", true);
                return;
            }
            if (amountNzd != null && (isNaN(amountNzd) || amountNzd < 0)) {
                showMessage($msg, "NZD amount must be zero or greater.", true);
                return;
            }
            if (
                !window.confirm(
                    "Reverse the entered amount from this student's prepayment?\nThis will be recorded in the financial ledger."
                )
            ) {
                return;
            }
            var payload = {};
            if (hasCny) {
                payload.amountCny = amountCny;
            }
            if (hasNzd) {
                payload.amountNzd = amountNzd;
            }
            if (note) {
                payload.note = note;
            }
            if (relatedBatchId) {
                payload.relatedBatchId = relatedBatchId;
            }
            var $btn = $("#student-recharge-reverse-submit");
            $btn.prop("disabled", true).text("Processing...");
            $msg.text("").removeClass("success error");
            postAdminUserRechargeReversal(userId, payload)
                .done(function (result) {
                    showMessage(
                        $msg,
                        (result && result.message) ||
                            "Reversal recorded. Prepayment: " +
                                formatDualMoneyLine(result.prepaymentCny, result.prepaymentNzd) +
                                " · Balance: " +
                                formatDualMoneyLine(result.balanceCny, result.balanceNzd),
                        false
                    );
                    $("#reversal-amount-cny").val("");
                    $("#reversal-amount-nzd").val("");
                    $("#reversal-note").val("");
                    $("#reversal-related-batch-id").val("");
                    var user = usersListCache.find(function (u) {
                        return String(u.id) === String(userId);
                    });
                    if (user && result) {
                        user.prepaymentCny = result.prepaymentCny;
                        user.prepaymentNzd = result.prepaymentNzd;
                        user.balanceCny = result.balanceCny;
                        user.balanceNzd = result.balanceNzd;
                        $("#recharge-wallet-label").text(
                            "Prepayment: " +
                                formatStudentMoney(user) +
                                " · Balance: " +
                                formatDualMoneyLine(user.balanceCny, user.balanceNzd)
                        );
                    }
                    loadRechargeRecords(userId);
                    loadUsers();
                })
                .fail(function (xhr) {
                    showMessage($msg, parseApiErrorMessage(xhr, "Reversal failed."), true);
                })
                .always(function () {
                    $btn.prop("disabled", false).text("Reverse");
                });
        });

        $("#student-enrollment-save").on("click", function () {
            var userId = $.trim($("#enrollment-user-id").val());
            if (!userId) {
                return;
            }
            var ids = [];
            $("#student-enrollment-modules .admin-enroll-slot-select").each(function () {
                var v = $.trim($(this).val() || "");
                if (v) {
                    ids.push(v);
                }
            });
            var $btn = $("#student-enrollment-save");
            var $em = $("#student-enrollment-message");
            $btn.prop("disabled", true).text("Saving...");
            $em.text("");
            putAdminUserEnrollmentSlots(userId, ids)
                .done(function () {
                    $em.text("Saved.").removeClass("error").addClass("success");
                    window.setTimeout(function () {
                        $enrollmentModal.modal("hide");
                    }, 500);
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Save failed."));
                })
                .always(function () {
                    $btn.prop("disabled", false).text("Save");
                });
        });

        loadUsers();
    }

    function bindAdminUserDetailPage() {
        var $section = $("#admin-user-detail-page");
        if (!$section.length) {
            return;
        }
        var userId = getQueryParam("userId");
        var $message = $("#admin-user-detail-message");
        var $userInfo = $("#admin-user-info");
        var detailUserCache = null;
        var inlineCommitting = false;

        if (!userId) {
            showMessage($message, "Missing userId.", true);
            return;
        }

        function inlineEditPencilHtml() {
            return (
                '<button type="button" class="btn btn-link btn-xs admin-inline-edit-trigger" style="padding:0 4px;vertical-align:baseline;" title="Click to edit">' +
                '<i class="fa fa-pencil text-muted"></i></button>'
            );
        }

        function restoreInlineDisplay($field, value) {
            var field = $field.attr("data-field");
            var displayVal = value != null && value !== "" ? value : field === "email" ? "-" : "";
            $field.html(
                '<span class="admin-inline-display" style="cursor:pointer;">' +
                    escapeHtml(displayVal) +
                    "</span> " +
                    inlineEditPencilHtml()
            );
        }

        function editableFieldRow(label, field, value) {
            var displayVal = value != null && value !== "" ? value : field === "email" ? "-" : "";
            return (
                '<p class="admin-user-field-row" style="margin-bottom:10px;">' +
                "<strong>" +
                escapeHtml(label) +
                "</strong> " +
                '<span class="admin-inline-field" data-field="' +
                escapeHtml(field) +
                '">' +
                '<span class="admin-inline-display" style="cursor:pointer;">' +
                escapeHtml(displayVal) +
                "</span> " +
                inlineEditPencilHtml() +
                "</span></p>"
            );
        }

        function startInlineEdit($field) {
            if (!$field.length || $field.find(".admin-inline-input").length || !detailUserCache) {
                return;
            }
            var field = $field.attr("data-field");
            var current = field === "email" ? detailUserCache.email || "" : detailUserCache.name || "";
            var inputType = field === "email" ? "email" : "text";
            $field.html(
                '<input type="' +
                    inputType +
                    '" class="form-control input-sm admin-inline-input" style="display:inline-block;width:auto;min-width:200px;max-width:320px;vertical-align:middle;" value="' +
                    escapeHtml(current) +
                    '">' +
                    '<span class="admin-inline-status" style="margin-left:8px;vertical-align:middle;"></span>'
            );
            var $input = $field.find(".admin-inline-input");
            $input.focus().select();
        }

        function commitInlineEdit($field) {
            if (inlineCommitting || !$field.length || !detailUserCache) {
                return;
            }
            var $input = $field.find(".admin-inline-input");
            if (!$input.length) {
                return;
            }

            var field = $field.attr("data-field");
            var newVal = $.trim($input.val());
            var oldName = $.trim(detailUserCache.name || "");
            var oldEmail = $.trim(detailUserCache.email || "");

            if (field === "name" && !newVal) {
                showMessage($message, "Name is required.", true);
                $input.focus();
                return;
            }
            if (field === "email" && !newVal) {
                showMessage($message, "Email is required.", true);
                $input.focus();
                return;
            }

            var unchanged =
                field === "name"
                    ? newVal === oldName
                    : newVal.toLowerCase() === oldEmail.toLowerCase();
            if (unchanged) {
                restoreInlineDisplay($field, field === "name" ? oldName : oldEmail || "-");
                return;
            }

            var payload = {
                name: field === "name" ? newVal : detailUserCache.name,
                email: field === "email" ? newVal : detailUserCache.email
            };

            inlineCommitting = true;
            $input.prop("disabled", true);
            $message.text("").removeClass("success error");

            patchAdminUser(userId, payload)
                .done(function () {
                    detailUserCache.name = payload.name;
                    detailUserCache.email = payload.email;
                    var savedVal = field === "name" ? payload.name : payload.email;
                    $field.find(".admin-inline-status").html(
                        '<span class="text-success" title="Saved" style="font-size:16px;"><i class="fa fa-check"></i></span>'
                    );
                    window.setTimeout(function () {
                        restoreInlineDisplay($field, savedVal);
                        inlineCommitting = false;
                    }, 1200);
                })
                .fail(function (xhr) {
                    inlineCommitting = false;
                    $input.prop("disabled", false);
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to update user.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                    $field.find(".admin-inline-status").html(
                        '<span class="text-danger" title="Failed"><i class="fa fa-times"></i></span>'
                    );
                });
        }

        function renderDetail(payload) {
            var user = payload.user || {};
            detailUserCache = user;
            var genderText = user.gender === "MALE" ? "Male" : user.gender === "FEMALE" ? "Female" : "-";
            var walletText =
                user.role === "STUDENT"
                    ? user.walletCurrency
                        ? "Default check-in: " + currencyLabel(user.walletCurrency)
                        : "Dual currency"
                    : "-";
            var html = [
                "<p><strong>Username:</strong> " + escapeHtml(user.username || "") + "</p>",
                editableFieldRow("Name:", "name", user.name || ""),
                editableFieldRow("Email:", "email", user.email || ""),
                "<p><strong>Role:</strong> " + escapeHtml(user.role || "") + "</p>",
                "<p><strong>Gender:</strong> " + escapeHtml(genderText) + "</p>"
            ];
            if (user.role === "STUDENT") {
                html.push("<p><strong>Wallet:</strong> " + escapeHtml(walletText) + "</p>");
                html.push(
                    "<p><strong>Prepayment (CNY):</strong> " +
                        escapeHtml(formatMoney(user.prepaymentCny ?? 0, "CNY")) +
                        "</p>"
                );
                html.push(
                    "<p><strong>Prepayment (NZD):</strong> " +
                        escapeHtml(formatMoney(user.prepaymentNzd ?? 0, "NZD")) +
                        "</p>"
                );
                html.push(
                    "<p><strong>Balance (CNY):</strong> " +
                        (Number(user.balanceCny ?? 0) < 0
                            ? '<span class="text-danger">' + escapeHtml(formatMoney(user.balanceCny ?? 0, "CNY")) + "</span>"
                            : escapeHtml(formatMoney(user.balanceCny ?? 0, "CNY"))) +
                        "</p>"
                );
                html.push(
                    "<p><strong>Balance (NZD):</strong> " +
                        (Number(user.balanceNzd ?? 0) < 0
                            ? '<span class="text-danger">' + escapeHtml(formatMoney(user.balanceNzd ?? 0, "NZD")) + "</span>"
                            : escapeHtml(formatMoney(user.balanceNzd ?? 0, "NZD"))) +
                        "</p>"
                );
            }
            html.push(
                '<p style="margin-top:16px;"><button type="button" class="btn btn-warning btn-sm" id="admin-reset-user-password">Reset Password</button></p>'
            );
            $userInfo.html(html.join(""));
            if (user.role === "STUDENT") {
                $("#admin-user-timetable-title").text("User Timetable");
                $("#admin-user-financial-section").show();
                loadFinancialLedger();
                loadTimetableModules(user.role);
            } else if (user.role === "TEACHER") {
                $("#admin-user-timetable-title").text("Teaching Timetable");
                $("#admin-user-financial-section").hide();
                loadTimetableModules(user.role);
            } else {
                $("#admin-user-timetable-title").text("User Timetable");
                $("#admin-user-financial-section").hide();
                $("#admin-user-modules").html('<p class="text-muted">No timetable for this role.</p>');
            }
        }

        function loadTimetableModules(role) {
            getAdminUserTimetableModules(userId)
                .done(function (payload) {
                    var emptyMessage =
                        role === "TEACHER"
                            ? "No teaching schedule assigned."
                            : "No enrolled timetable modules.";
                    renderModuleTables("#admin-user-modules", payload, {
                        allowApprove: role === "STUDENT",
                        emptyMessage: emptyMessage
                    });
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to load user timetable."));
                    $("#admin-user-modules").html(
                        '<p class="text-muted">Could not load timetable.</p>'
                    );
                });
        }

        function formatLedgerAmount(item) {
            if (item.type === "RECHARGE" || item.type === "REVERSAL") {
                return formatRechargeBatchAmount({
                    amountCny: item.amountCny,
                    amountNzd: item.amountNzd
                });
            }
            if (item.amount != null && item.currency) {
                return formatMoney(item.amount, item.currency) + " (" + item.currency + ")";
            }
            return "—";
        }

        function renderFinancialLedger(payload) {
            var raw = payload || {};
            if (raw.data && raw.data.items) {
                raw = raw.data;
            }
            var user = raw.user || {};
            var items = Array.isArray(raw.items) ? raw.items : [];
            $("#admin-user-financial-summary").html(
                "Prepayment: " +
                    escapeHtml(formatDualMoneyLine(user.prepaymentCny, user.prepaymentNzd)) +
                    " · Balance: " +
                    formatDualBalanceLine(user.balanceCny, user.balanceNzd)
            );
            if (!items.length) {
                $("#admin-user-financial-ledger").html('<p class="text-muted">No financial records yet.</p>');
                return;
            }
            var html = [];
            html.push(
                '<div class="table-responsive"><table class="table table-bordered table-striped" style="font-size:13px;">'
            );
            html.push(
                "<thead><tr><th>Time</th><th>Type</th><th>In/Out</th><th>Amount</th><th>Detail</th><th>Source</th><th>By</th><th>Reason</th><th>Balance after</th></tr></thead><tbody>"
            );
            items.forEach(function (item) {
                var typeLabel =
                    item.type === "RECHARGE"
                        ? "Recharge"
                        : item.type === "REVERSAL"
                          ? "Reversal"
                          : "Check-in";
                var dirLabel =
                    item.direction === "IN"
                        ? '<span class="text-success">IN</span>'
                        : '<span class="text-danger">OUT</span>';
                var by = item.createdBy
                    ? escapeHtml(item.createdBy.name || item.createdBy.username || "—")
                    : "—";
                var reason =
                    item.type === "CHECK_IN"
                        ? escapeHtml(
                              item.billingSelectionReasonLabel ||
                                  billingReasonLabel(item.billingSelectionReason)
                          )
                        : "—";
                var balanceAfter =
                    item.balanceCnyAfter != null || item.balanceNzdAfter != null
                        ? formatDualBalanceLine(item.balanceCnyAfter || 0, item.balanceNzdAfter || 0)
                        : "—";
                html.push("<tr>");
                html.push("<td>" + escapeHtml(formatRecordDateTime(item.createdAt)) + "</td>");
                html.push("<td>" + escapeHtml(typeLabel) + "</td>");
                html.push("<td>" + dirLabel + "</td>");
                html.push("<td>" + escapeHtml(formatLedgerAmount(item)) + "</td>");
                html.push("<td>" + escapeHtml(item.detail || "—") + "</td>");
                html.push(
                    "<td>" +
                        escapeHtml(item.recordSourceLabel || recordSourceLabel(item.recordSource)) +
                        "</td>"
                );
                html.push("<td>" + by + "</td>");
                html.push("<td>" + reason + "</td>");
                html.push("<td>" + balanceAfter + "</td>");
                html.push("</tr>");
            });
            html.push("</tbody></table></div>");
            $("#admin-user-financial-ledger").html(html.join(""));
        }

        function formatRecordDateTime(iso) {
            if (!iso) {
                return "—";
            }
            try {
                var d = new Date(iso);
                if (isNaN(d.getTime())) {
                    return String(iso);
                }
                return d.toLocaleString();
            } catch (e) {
                return String(iso);
            }
        }

        function loadFinancialLedger() {
            $("#admin-user-financial-ledger").html('<p class="text-muted">Loading...</p>');
            getAdminUserFinancialLedger(userId)
                .done(function (payload) {
                    renderFinancialLedger(payload);
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to load financial ledger."));
                    $("#admin-user-financial-ledger").html(
                        '<p class="text-muted">Could not load financial ledger.</p>'
                    );
                });
        }

        $userInfo.on("click", ".admin-inline-edit-trigger, .admin-inline-display", function (e) {
            e.preventDefault();
            startInlineEdit($(this).closest(".admin-inline-field"));
        });

        $userInfo.on("keydown", ".admin-inline-input", function (e) {
            if (e.key === "Enter" || e.keyCode === 13) {
                e.preventDefault();
                commitInlineEdit($(this).closest(".admin-inline-field"));
            } else if (e.key === "Escape" || e.keyCode === 27) {
                e.preventDefault();
                var $field = $(this).closest(".admin-inline-field");
                var field = $field.attr("data-field");
                if (!detailUserCache) {
                    return;
                }
                restoreInlineDisplay(
                    $field,
                    field === "name" ? detailUserCache.name : detailUserCache.email || "-"
                );
            }
        });

        $userInfo.on("blur", ".admin-inline-input", function () {
            var $field = $(this).closest(".admin-inline-field");
            window.setTimeout(function () {
                if ($field.find(".admin-inline-input").length && !inlineCommitting) {
                    commitInlineEdit($field);
                }
            }, 150);
        });

        function loadDetail() {
            getAdminUserDetail(userId)
                .done(function (payload) {
                    renderDetail(payload);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load user detail.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        $(document).on("click", "[data-approve-selection]", function () {
            var selectionId = $(this).attr("data-approve-selection");
            approveSelection(selectionId)
                .done(function (payload) {
                    showMessage($message, (payload && payload.message) || "Approved.", false);
                    loadTimetableModules(detailUserCache && detailUserCache.role);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Approval failed.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });

        $(document).on("click", "[data-reject-selection]", function () {
            var selectionId = $(this).attr("data-reject-selection");
            rejectSelection(selectionId)
                .done(function (payload) {
                    showMessage($message, (payload && payload.message) || "Rejected.", false);
                    loadTimetableModules(detailUserCache && detailUserCache.role);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Reject failed.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });

        $section.on("click", "#admin-reset-user-password", function () {
            var userName =
                (detailUserCache && (detailUserCache.name || detailUserCache.username)) || "this user";
            if (
                !window.confirm(
                    "Reset password for " +
                        userName +
                        " to the default (12345678)?\nThe user must change password on next login."
                )
            ) {
                return;
            }
            var $btn = $(this);
            $btn.prop("disabled", true).text("Resetting...");
            adminResetUserPassword(userId)
                .done(function (payload) {
                    showMessage($message, (payload && payload.message) || "Password reset successfully.", false);
                })
                .fail(function (xhr) {
                    showErrorAlert(parseApiErrorMessage(xhr, "Failed to reset password."));
                })
                .always(function () {
                    $btn.prop("disabled", false).text("Reset Password");
                });
        });

        loadDetail();
    }

    function toMinute(value) {
        var parts = String(value || "").split(":");
        if (parts.length !== 2) {
            return NaN;
        }
        return Number(parts[0]) * 60 + Number(parts[1]);
    }

    function slotsToSlotRows(slots) {
        if (!slots || !slots.length) {
            return [];
        }
        var timeMap = {};
        function emptyDays() {
            return [[], [], [], [], [], [], []];
        }
        slots.forEach(function (slot) {
            var key = slot.startTime + "-" + slot.endTime;
            if (!timeMap[key]) {
                timeMap[key] = {
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    days: emptyDays()
                };
            }
            var dayIdx = slot.weekday - 1;
            var sid = String(slot.id == null ? "" : slot.id).trim();
            if (dayIdx >= 0 && dayIdx < 7 && sid) {
                timeMap[key].days[dayIdx].push({ slotId: sid, course: slot.course });
            }
        });
        var rows = [];
        for (var k in timeMap) {
            if (timeMap.hasOwnProperty(k)) {
                rows.push(timeMap[k]);
            }
        }
        rows.sort(function (a, b) {
            return toMinute(a.startTime) - toMinute(b.startTime);
        });
        return rows;
    }

    function toTimeText(minute) {
        var hour = Math.floor(minute / 60);
        var min = minute % 60;
        return String(hour).padStart(2, "0") + ":" + String(min).padStart(2, "0");
    }

    function parseDateInput(value) {
        var parts = String(value || "").split("-");
        if (parts.length !== 3) {
            return null;
        }
        var y = Number(parts[0]);
        var m = Number(parts[1]) - 1;
        var d = Number(parts[2]);
        if (isNaN(y) || isNaN(m) || isNaN(d)) {
            return null;
        }
        return new Date(y, m, d);
    }

    function startOfWeekMonday(date) {
        var dt = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        var weekday = dt.getDay();
        var delta = weekday === 0 ? -6 : 1 - weekday;
        dt.setDate(dt.getDate() + delta);
        dt.setHours(0, 0, 0, 0);
        return dt;
    }

    function buildWeekOffsetsByDateRange(startDate, endDate) {
        var startMonday = startOfWeekMonday(startDate);
        var endMonday = startOfWeekMonday(endDate);
        var currentMonday = startOfWeekMonday(new Date());
        var offsets = [];
        var cursor = new Date(startMonday.getTime());
        while (cursor.getTime() <= endMonday.getTime()) {
            var offset = Math.floor((cursor.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
            offsets.push(offset);
            cursor.setDate(cursor.getDate() + 7);
        }
        return offsets;
    }

    function bindAdminTimetablePage() {
        var $page = $("#admin-timetable-page");
        if (!$page.length) {
            return;
        }

        var $modules = $("#admin-timetable-modules");
        var $message = $("#admin-timetable-message");
        var modulesState = [];

        function formatDateInput(date) {
            var y = date.getFullYear();
            var m = String(date.getMonth() + 1).padStart(2, "0");
            var d = String(date.getDate()).padStart(2, "0");
            return y + "-" + m + "-" + d;
        }

        function getTodayDate() {
            var now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        function emptyDayArrays() {
            return [[], [], [], [], [], [], []];
        }

        function defaultRows() {
            return [{
                startTime: "10:00",
                endTime: "11:00",
                courseIds: emptyDayArrays()
            }];
        }

        function normalizeDayCourseIds(val) {
            if (Array.isArray(val)) {
                return val.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
            }
            if (typeof val === "string" && val.trim()) {
                return [val.trim()];
            }
            return [];
        }

        function slotsToRows(slots) {
            if (!slots || !slots.length) {
                return defaultRows();
            }
            var timeMap = {};
            slots.forEach(function (slot) {
                var key = slot.startTime + "-" + slot.endTime;
                if (!timeMap[key]) {
                    timeMap[key] = {
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        courseIds: emptyDayArrays()
                    };
                }
                var dayIdx = slot.weekday - 1;
                if (dayIdx >= 0 && dayIdx < 7) {
                    var cid = (slot.course && slot.course.id) || "";
                    if (cid) {
                        timeMap[key].courseIds[dayIdx].push(cid);
                    }
                }
            });
            var rows = [];
            for (var k in timeMap) {
                if (timeMap.hasOwnProperty(k)) {
                    rows.push(timeMap[k]);
                }
            }
            rows.sort(function (a, b) {
                return toMinute(a.startTime) - toMinute(b.startTime);
            });
            return rows.length ? rows : defaultRows();
        }

        function normalizeRows(rows) {
            var safeRows = Array.isArray(rows) && rows.length ? rows : defaultRows();
            return safeRows.map(function (row) {
                var perDay = row.courseIds;
                var out = [];
                var i;
                if (Array.isArray(perDay) && perDay.length === 7) {
                    for (i = 0; i < 7; i += 1) {
                        out.push(normalizeDayCourseIds(perDay[i]));
                    }
                } else {
                    for (i = 0; i < 7; i += 1) {
                        out.push([]);
                    }
                }
                return {
                    startTime: row.startTime || "10:00",
                    endTime: row.endTime || "11:00",
                    courseIds: out
                };
            });
        }

        function collectSlots($module) {
            var slots = [];
            $module.find("tbody tr").each(function () {
                var $tr = $(this);
                var startTime = $.trim($tr.find(".row-start-time").val());
                var endTime = $.trim($tr.find(".row-end-time").val());
                var startMinute = toMinute(startTime);
                var endMinute = toMinute(endTime);
                if (isNaN(startMinute) || isNaN(endMinute)) {
                    throw new Error("Invalid time format.");
                }
                if (startMinute < 360 || endMinute > 1080 || startMinute >= endMinute) {
                    throw new Error("Time range must be between 06:00 and 18:00, and end must be after start.");
                }
                var dayIndex = 0;
                $tr.find("td.timetable-day-cell").each(function () {
                    $(this).find(".timetable-course-cb:checked").each(function () {
                        var courseId = $.trim($(this).val() || "");
                        if (courseId) {
                            slots.push({
                                weekday: dayIndex + 1,
                                startTime: startTime,
                                endTime: endTime,
                                courseId: courseId
                            });
                        }
                    });
                    dayIndex++;
                });
            });
            return slots;
        }

        function timetableCourseLineLabel(course) {
            return formatTimetableCourseLine(course);
        }

        function buildTimetableSummaryText(ids) {
            if (!ids || !ids.length) {
                return "";
            }
            return ids
                .map(function (id) {
                    var c = adminCourseCache.find(function (x) {
                        return x.id === id;
                    });
                    return c ? timetableCourseLineLabel(c) : id;
                })
                .join(", ");
        }

        function renderDayCell(courseIdsForDay) {
            var selected = Array.isArray(courseIdsForDay) ? courseIdsForDay.filter(Boolean) : [];
            var summaryText = buildTimetableSummaryText(selected);
            var checkboxes = adminCourseCache
                .map(function (course) {
                    if (!course || !course.id) {
                        return "";
                    }
                    var tid = course.teacher && course.teacher.id ? course.teacher.id : "";
                    var checked = selected.indexOf(course.id) >= 0 ? ' checked="checked"' : "";
                    var label = timetableCourseLineLabel(course);
                    return (
                        '<label class="timetable-cb-label" style="display:block;font-weight:normal;margin:0 0 6px;padding-left:22px;text-indent:-22px;cursor:pointer;">' +
                        '<input type="checkbox" class="timetable-course-cb" value="' +
                        escapeHtml(course.id) +
                        '" data-teacher-id="' +
                        escapeHtml(tid) +
                        '"' +
                        checked +
                        "> " +
                        escapeHtml(label) +
                        "</label>"
                    );
                })
                .join("");
            var summaryHtml = summaryText
                ? escapeHtml(summaryText)
                : '<span class="text-muted">Select courses...</span>';
            var toggleTitleAttr = summaryText ? ' title="' + escapeHtml(summaryText) + '"' : "";
            var hasCoursesClass = summaryText ? " timetable-has-courses" : "";
            return (
                '<td class="timetable-day-cell">' +
                '<div class="timetable-course-picker" style="position:relative;min-width:140px;max-width:220px;">' +
                '<button type="button" class="form-control input-sm timetable-picker-toggle' +
                hasCoursesClass +
                '" style="text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:24px;"' +
                toggleTitleAttr +
                ">" +
                '<span class="timetable-picker-summary">' +
                summaryHtml +
                "</span>" +
                "</button>" +
                '<div class="timetable-picker-dropdown" style="display:none;position:absolute;left:0;right:0;z-index:1050;background:#fff;border:1px solid #ccc;border-radius:2px;box-shadow:0 2px 8px rgba(0,0,0,.12);max-height:240px;overflow-y:auto;padding:8px 10px;margin-top:2px;">' +
                (checkboxes || '<span class="text-muted" style="font-size:12px;">No courses. Add courses in Course List first.</span>') +
                "</div></div></td>"
            );
        }

        function updateTimetablePickerSummary($cell) {
            var ids = [];
            $cell.find(".timetable-course-cb:checked").each(function () {
                ids.push($(this).val());
            });
            var text = buildTimetableSummaryText(ids);
            var $span = $cell.find(".timetable-picker-summary");
            var $toggle = $cell.find(".timetable-picker-toggle");
            if (text) {
                $span.text(text);
                $toggle.attr("title", text).addClass("timetable-has-courses");
            } else {
                $span.html('<span class="text-muted">Select courses...</span>');
                $toggle.removeAttr("title").removeClass("timetable-has-courses");
            }
        }

        function collectModulePayload($module) {
            var startDate = $.trim($module.find(".module-start-date").val() || "");
            var endDate = $.trim($module.find(".module-end-date").val() || "");
            if (!startDate || !endDate) {
                throw new Error("Please select start and end date.");
            }
            var parsedStart = parseDateInput(startDate);
            var parsedEnd = parseDateInput(endDate);
            if (!parsedStart || !parsedEnd) {
                throw new Error("Invalid date format.");
            }
            return {
                startDate: startDate,
                endDate: endDate,
                slots: collectSlots($module)
            };
        }

        function getPickerDropdown($picker) {
            var $dd = $picker.children(".timetable-picker-dropdown");
            if ($dd.length) {
                return $dd;
            }
            return $("body > .timetable-picker-dropdown").filter(function () {
                var ap = $(this).data("timetablePortalPicker");
                return ap && ap.length && $picker.length && ap[0] === $picker[0];
            });
        }

        function restoreTimetablePickerDropdown($dd) {
            var $picker = $dd.data("timetablePortalPicker");
            if ($picker && $picker.length) {
                $dd.removeData("timetablePortalPicker");
                $dd.removeClass("timetable-picker-dropdown-fixed");
                $dd.css({
                    position: "",
                    left: "",
                    top: "",
                    width: "",
                    minWidth: "",
                    maxWidth: "",
                    right: "",
                    bottom: "",
                    marginTop: "",
                    zIndex: "",
                    maxHeight: ""
                });
                $picker.append($dd);
            }
        }

        function closeAllTimetablePickers() {
            $(".timetable-picker-dropdown").each(function () {
                var $dd = $(this);
                $dd.hide();
                restoreTimetablePickerDropdown($dd);
            });
        }

        function renderTimetableRowActionCell() {
            return (
                '<td class="timetable-row-actions" style="text-align:center;vertical-align:middle;white-space:nowrap;">' +
                '<button type="button" class="btn btn-xs btn-success" data-add-row="1">+</button> ' +
                '<button type="button" class="btn btn-xs btn-danger" data-remove-row="1">-</button>' +
                "</td>"
            );
        }

        function renderModules() {
            closeAllTimetablePickers();
            $modules.empty();
            if (!modulesState.length) {
                $modules.html('<p>No modules yet. Click + to create one.</p>');
                return;
            }

            modulesState.forEach(function (module) {
                var rows = normalizeRows(module.rows || slotsToRows(module.slots));
                var minDate = formatDateInput(getTodayDate());
                var html = [];
                html.push('<div class="panel panel-default admin-module-card" data-module-id="' + escapeHtml(module.id) + '" style="margin-bottom:20px;">');
                html.push('<div class="panel-heading" style="display:flex;justify-content:space-between;align-items:center;">');
                html.push('<div><strong>Date Range Module</strong></div>');
                html.push('<div>');
                html.push('<button type="button" class="btn btn-xs btn-danger" data-delete-module="' + escapeHtml(module.id) + '" title="Delete this module">-</button> ');
                html.push('<button type="button" class="btn btn-xs btn-primary" data-add-module-inline="1" title="Add another module">+</button>');
                html.push("</div>");
                html.push('</div>');
                html.push('<div class="panel-body">');
                html.push('<div class="row" style="margin-bottom:12px;">');
                html.push('<div class="col-sm-4"><label>Start date</label><input type="date" min="' + escapeHtml(minDate) + '" class="form-control module-start-date" value="' + escapeHtml(module.startDate || "") + '"></div>');
                html.push('<div class="col-sm-4"><label>End date</label><input type="date" min="' + escapeHtml(minDate) + '" class="form-control module-end-date" value="' + escapeHtml(module.endDate || "") + '"></div>');
                html.push('<div class="col-sm-4" style="padding-top:24px;"><span class="module-save-state text-muted"></span></div>');
                html.push('</div>');
                html.push('<div class="table-responsive"><table class="table table-bordered"><thead><tr>');
                html.push('<th>Action</th><th>Start</th><th>End</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th><th>Sunday</th><th>Action</th>');
                html.push('</tr></thead><tbody>');
                rows.forEach(function (row, rowIndex) {
                    html.push('<tr data-row-index="' + rowIndex + '">');
                    html.push(renderTimetableRowActionCell());
                    html.push('<td><input type="time" class="form-control input-sm row-start-time" value="' + escapeHtml(row.startTime || "10:00") + '"></td>');
                    html.push('<td><input type="time" class="form-control input-sm row-end-time" value="' + escapeHtml(row.endTime || "11:00") + '"></td>');
                    for (var i = 0; i < 7; i += 1) {
                        html.push(renderDayCell(row.courseIds[i]));
                    }
                    html.push(renderTimetableRowActionCell());
                    html.push('</tr>');
                });
                html.push('</tbody></table></div>');
                html.push('</div></div>');
                $modules.append(html.join(""));
            });
        }

        function loadModules() {
            $.when(getAdminCourses(), getAdminTimetableModules())
                .done(function (coursePayload, modulePayload) {
                    var normalizedCoursePayload = (coursePayload && coursePayload.courses) ? coursePayload : {};
                    var normalizedModulePayload = (modulePayload && modulePayload.modules) ? modulePayload : {};
                    setAdminCourseCache(normalizedCoursePayload.courses || []);
                    var rawModules = normalizedModulePayload.modules || [];
                    modulesState = rawModules.map(function (m) {
                        return {
                            id: m.id,
                            startDate: m.startDate,
                            endDate: m.endDate,
                            rows: slotsToRows(m.slots || [])
                        };
                    });
                    renderModules();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load timetable modules.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        function saveModule($module) {
            var moduleId = $module.attr("data-module-id");
            var payload;
            try {
                payload = collectModulePayload($module);
            } catch (err) {
                showErrorAlert(err.message || "Invalid timetable module.");
                return $.Deferred().reject().promise();
            }
            $module.find(".module-save-state").text("Saving...");
            return updateAdminTimetableModule(moduleId, payload)
                .done(function () {
                    for (var si = 0; si < modulesState.length; si += 1) {
                        if (String(modulesState[si].id) === String(moduleId)) {
                            modulesState[si].startDate = payload.startDate;
                            modulesState[si].endDate = payload.endDate;
                            break;
                        }
                    }
                    $module.find(".module-save-state").text("Saved");
                    window.setTimeout(function () {
                        $module.find(".module-save-state").text("");
                    }, 1000);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Save failed.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                    $module.find(".module-save-state").text("Save failed");
                });
        }

        function getNewModuleRange() {
            var start = getTodayDate();
            var $cards = $modules.find(".admin-module-card");
            if ($cards.length) {
                var lastEnd = null;
                $cards.each(function () {
                    var endVal = $.trim($(this).find(".module-end-date").val() || "");
                    var moduleEnd = parseDateInput(endVal);
                    if (moduleEnd && (!lastEnd || moduleEnd.getTime() > lastEnd.getTime())) {
                        lastEnd = moduleEnd;
                    }
                });
                if (lastEnd) {
                    start = new Date(lastEnd.getTime());
                    start.setDate(start.getDate() + 1);
                }
            }
            var end = new Date(start.getTime());
            end.setDate(end.getDate() + 6);
            return {
                startDate: formatDateInput(start),
                endDate: formatDateInput(end)
            };
        }

        function createModule() {
            var range = getNewModuleRange();
            createAdminTimetableModule({
                startDate: range.startDate,
                endDate: range.endDate,
                slots: []
            })
                .done(function () {
                    loadModules();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to create module.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        $("#admin-add-module-btn").on("click", function () {
            createModule();
        });

        $page.on("click", "[data-add-module-inline='1']", function () {
            createModule();
        });

        $page.on("click", "[data-add-row='1']", function () {
            var $module = $(this).closest(".admin-module-card");
            var $row = $(this).closest("tr");
            var previousStart = $.trim($row.find(".row-start-time").val() || "");
            var previousEnd = $.trim($row.find(".row-end-time").val() || "");
            var previousStartMinute = toMinute(previousStart);
            var previousEndMinute = toMinute(previousEnd);
            var duration = (!isNaN(previousStartMinute) && !isNaN(previousEndMinute) && previousEndMinute > previousStartMinute)
                ? (previousEndMinute - previousStartMinute)
                : 60;
            var nextStartMinute = !isNaN(previousEndMinute) ? previousEndMinute : 600;
            var nextEndMinute = nextStartMinute + duration;
            var nextStart = toTimeText(nextStartMinute);
            var nextEnd = toTimeText(nextEndMinute);
            var html = [
                "<tr>",
                renderTimetableRowActionCell(),
                '<td><input type="time" class="form-control input-sm row-start-time" value="' + escapeHtml(nextStart) + '"></td>',
                '<td><input type="time" class="form-control input-sm row-end-time" value="' + escapeHtml(nextEnd) + '"></td>'
            ];
            for (var j = 0; j < 7; j += 1) {
                html.push(renderDayCell([]));
            }
            html.push(renderTimetableRowActionCell());
            html.push("</tr>");
            $row.after(html.join(""));
            saveModule($module);
        });

        $page.on("click", "[data-delete-module]", function () {
            var moduleId = $(this).attr("data-delete-module");
            var $card = $(this).closest(".admin-module-card");
            if (!moduleId || !$card.length) {
                return;
            }
            if (!window.confirm("Delete this date range module and all its schedule slots?")) {
                return;
            }
            deleteAdminTimetableModule(moduleId)
                .done(function () {
                    showMessage($message, "Module deleted.", false);
                    loadModules();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to delete module.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });

        $(document).on("click.timetableCloseDropdown", function () {
            closeAllTimetablePickers();
        });

        $(window).on("scroll.timetablePickerPortal resize.timetablePickerPortal", function () {
            if ($(".timetable-picker-dropdown-fixed:visible").length) {
                closeAllTimetablePickers();
            }
        });

        $page.on("click", ".timetable-course-picker", function (e) {
            e.stopPropagation();
        });

        $page.on("click", ".timetable-picker-toggle", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var $toggle = $(this);
            var $picker = $toggle.closest(".timetable-course-picker");
            var $dd = getPickerDropdown($picker);
            if (!$dd.length) {
                return;
            }
            var wasOpen = $dd.is(":visible");
            closeAllTimetablePickers();
            if (!wasOpen) {
                var rect = $toggle[0].getBoundingClientRect();
                var vh = window.innerHeight || document.documentElement.clientHeight || 0;
                var vw = window.innerWidth || document.documentElement.clientWidth || 0;
                var spaceBelow = vh - rect.bottom - 8;
                var maxH = Math.min(240, Math.max(48, spaceBelow));
                var btnW = Math.round(rect.width);
                var leftPx = Math.round(rect.left);
                $dd.data("timetablePortalPicker", $picker);
                $dd.addClass("timetable-picker-dropdown-fixed");
                $("body").append($dd);
                var maxAllowed = Math.max(btnW, vw - leftPx - 8);
                $dd.css({
                    display: "inline-block",
                    verticalAlign: "top",
                    position: "fixed",
                    left: leftPx + "px",
                    top: Math.round(rect.bottom + 2) + "px",
                    width: "auto",
                    minWidth: btnW + "px",
                    maxWidth: "none",
                    right: "auto",
                    marginTop: 0,
                    zIndex: 10050,
                    maxHeight: maxH + "px"
                });
                var natural = Math.ceil($dd.outerWidth());
                var w = Math.max(btnW, Math.min(natural, maxAllowed));
                $dd.css({
                    display: "block",
                    width: w + "px",
                    maxWidth: maxAllowed + "px"
                });
            }
        });

        $page.on("change", ".timetable-course-cb", function () {
            var $cb = $(this);
            var $cell = $cb.closest(".timetable-day-cell");
            if ($cb.prop("checked")) {
                var tid = $.trim($cb.attr("data-teacher-id") || "");
                var cid = $cb.val();
                var conflict = false;
                if (tid) {
                    $cell.find(".timetable-course-cb:checked").each(function () {
                        if (this === $cb[0]) {
                            return;
                        }
                        var otid = $.trim($(this).attr("data-teacher-id") || "");
                        var ocid = $(this).val();
                        if (otid && otid === tid && ocid !== cid) {
                            conflict = true;
                            return false;
                        }
                    });
                }
                if (conflict) {
                    $cb.prop("checked", false);
                    showMessage(
                        $message,
                        "A teacher cannot teach multiple different courses in the same time slot.",
                        true
                    );
                }
            }
            updateTimetablePickerSummary($cell);
            saveModule($cell.closest(".admin-module-card"));
        });

        $page.on("click", "[data-remove-row='1']", function () {
            var $module = $(this).closest(".admin-module-card");
            var $tbody = $(this).closest("tbody");
            if ($tbody.find("tr").length <= 1) {
                showErrorAlert("At least one time row is required.");
                return;
            }
            $(this).closest("tr").remove();
            saveModule($module);
        });

        $page.on("change", ".module-start-date, .module-end-date, .row-start-time, .row-end-time", function () {
            var $module = $(this).closest(".admin-module-card");
            saveModule($module);
        });

        $(document).on("topedu:courses-updated", function () {
            renderModules();
        });

        loadModules();
        window.setTimeout(function () {
            if (!modulesState.length) {
                createModule();
            }
        }, 200);
    }

    function bindAdminCoursesPage() {
        var $page = $("#admin-courses-page");
        if (!$page.length) {
            return;
        }
        var $message = $("#admin-courses-message");
        var $tbody = $("#admin-courses-body");
        var teacherCache = [];

        function typeLabel(val) {
            if (val === "GROUP") return "Group";
            if (val === "PRIVATE") return "One-on-One";
            return val || "-";
        }

        function renderCourses(courses) {
            $tbody.empty();
            if (!courses || !courses.length) {
                $tbody.append('<tr><td colspan="6">No courses.</td></tr>');
                return;
            }
            courses.forEach(function (course) {
                var teacherName = (course.teacher && course.teacher.name) ? course.teacher.name : "-";
                $tbody.append(
                    "<tr>" +
                    "<td>" + escapeHtml(course.name || "") + "</td>" +
                    "<td>" + escapeHtml(teacherName) + "</td>" +
                    "<td>" + escapeHtml(typeLabel(course.type)) + "</td>" +
                    "<td>" + escapeHtml(formatMoney(course.feeCny ?? 0, "CNY")) + "</td>" +
                    "<td>" + escapeHtml(formatMoney(course.feeNzd ?? 0, "NZD")) + "</td>" +
                    '<td><button class="btn btn-xs btn-danger" data-delete-course="' + escapeHtml(course.id) + '">Delete</button></td>' +
                    "</tr>"
                );
            });
        }

        function loadCourses() {
            getAdminCourses()
                .done(function (payload) {
                    var courses = payload.courses || [];
                    setAdminCourseCache(courses);
                    renderCourses(courses);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load courses.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        function loadTeachers() {
            getAdminUsers("").then(function (payload) {
                var users = payload.users || [];
                teacherCache = users.filter(function (u) { return u.role === "TEACHER"; });
                renderTeacherOptions();
            });
        }

        function renderTeacherOptions() {
            var $select = $("#cc-teacher");
            $select.empty().append('<option value="">-- Select Teacher --</option>');
            teacherCache.forEach(function (t) {
                $select.append('<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + ' (' + escapeHtml(t.email) + ')</option>');
            });
        }

        var $modal = $("#create-course-modal");
        var $ccMessage = $("#create-course-message");

        $modal.on("show.bs.modal", function () {
            loadTeachers();
        });

        $modal.on("hidden.bs.modal", function () {
            $("#create-course-form")[0].reset();
            $ccMessage.text("").removeClass("success error");
        });

        $("#create-course-submit").on("click", function () {
            var name = $.trim($("#cc-name").val());
            var teacherId = $("#cc-teacher").val();
            var type = $("#cc-type").val();
            var feeCny = parseFloat($("#cc-fee-cny").val());
            var feeNzd = parseFloat($("#cc-fee-nzd").val());

            if (!name) {
                showMessage($ccMessage, "Please enter a course name.", true);
                return;
            }
            if (!teacherId) {
                showMessage($ccMessage, "Please select a teacher.", true);
                return;
            }
            if (isNaN(feeCny) || feeCny < 0) {
                showMessage($ccMessage, "Please enter a valid CNY fee.", true);
                return;
            }
            if (isNaN(feeNzd) || feeNzd < 0) {
                showMessage($ccMessage, "Please enter a valid NZD fee.", true);
                return;
            }

            var payload = {
                name: name,
                teacherId: teacherId,
                type: type,
                feeCny: feeCny,
                feeNzd: feeNzd
            };

            $("#create-course-submit").prop("disabled", true).text("Saving...");

            createAdminCourse(payload)
                .done(function () {
                    showMessage($ccMessage, "Course created successfully!", false);
                    window.setTimeout(function () {
                        $modal.modal("hide");
                        loadCourses();
                    }, 800);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to create course.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($ccMessage, msg, true);
                })
                .always(function () {
                    $("#create-course-submit").prop("disabled", false).text("Save");
                });
        });

        $page.on("click", "[data-delete-course]", function () {
            var id = $(this).attr("data-delete-course");
            if (!window.confirm("Delete this course?")) {
                return;
            }
            deleteAdminCourse(id)
                .done(function () {
                    showMessage($message, "Course deleted.", false);
                    loadCourses();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to delete course.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    if (String(msg).indexOf("used in timetable") !== -1) {
                        msg = "This course is already used in timetable and cannot be deleted.";
                    }
                    showMessage($message, msg, true);
                });
        });

        loadCourses();
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
        var requireAdmin = $("body").attr("data-require-admin") === "true";
        var currentUser = getUser();

        if (pageType === "login" || pageType === "register") {
            if (isAuthenticated()) {
                window.location.href = getRedirectTarget(getHomePageByRole(currentUser));
            }
            return;
        }

        if (currentUser && currentUser.mustChangePassword && window.location.pathname.indexOf("change-password.html") === -1) {
            window.location.href = "change-password.html";
            return;
        }

        if (requireAuth && !isAuthenticated()) {
            var redirect = encodeURIComponent(window.location.pathname.split("/").pop() || "index.html");
            window.location.href = "login.html?redirect=" + redirect;
            return;
        }

        if (requireAdmin && currentUser && currentUser.role !== "ADMIN") {
            window.location.href = getHomePageByRole(currentUser);
        }
    }

    function init() {
        renderAuthNav();
        bindLogout();
        bindLoginForm();
        bindRegisterForm();
        bindChangePasswordForm();
        bindResetPasswordPage();
        bindStudentDashboardPage();
        bindAdminUsersPage();
        bindAdminUserDetailPage();
        bindAdminTimetablePage();
        bindAdminCoursesPage();
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
        forgotPassword: forgotPassword,
        resetPassword: resetPassword,
        logout: logout,
        refresh: refresh,
        me: me,
        changePassword: changePassword,
        getUser: getUser,
        isAuthenticated: isAuthenticated,
        clearAuth: clearAuth,
        renderAuthNav: renderAuthNav
    };

    init();
})(window, jQuery);
