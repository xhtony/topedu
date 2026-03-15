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
            '<li class="auth-menu-item"><a href="' + home + '">My Center</a></li>',
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

    function selectCourse(slotId) {
        return api.post("/student/select-course", { slotId: slotId }).then(function (response) {
            return normalizePayload(response);
        });
    }

    function getAdminUsers(email) {
        return api.get("/admin/users", email ? { email: email } : {}).then(function (response) {
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

    function approveSelection(selectionId) {
        return api.post("/admin/selections/" + encodeURIComponent(selectionId) + "/approve", {}).then(function (response) {
            return normalizePayload(response);
        });
    }

    function rejectSelection(selectionId) {
        return api.post("/admin/selections/" + encodeURIComponent(selectionId) + "/reject", {}).then(function (response) {
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
        return api.post("/admin/courses/" + encodeURIComponent(courseId) + "/delete", {}).then(function (response) {
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
                email: $.trim($("#login-email").val()),
                password: $("#login-password").val()
            };

            if (!data.email || !data.password) {
                showMessage($message, "Please fill in email and password.", true);
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
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to update password.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
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
                    startCountdown(90);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to send verification code.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
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
            $container.html('<p>No timetable modules configured.</p>');
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

    function bindStudentDashboardPage() {
        var $section = $("#student-dashboard");
        if (!$section.length) {
            return;
        }
        var $message = $("#dashboard-message");

        function load() {
            getStudentTimetable()
                .done(function (payload) {
                    renderModuleTables("#student-modules", payload, { allowSelect: true });
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load timetable.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        $(document).on("click", "[data-select-slot]", function () {
            var slotId = $(this).attr("data-select-slot");
            selectCourse(slotId)
                .done(function (payload) {
                    showMessage($message, (payload && payload.message) || "Selection submitted.", false);
                    load();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to select course.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });

        load();
    }

    function bindAdminUsersPage() {
        var $section = $("#admin-users-page");
        if (!$section.length) {
            return;
        }
        var $tableBody = $("#admin-users-body");
        var $search = $("#admin-search-email");
        var $message = $("#admin-users-message");

        function renderUsers(users) {
            $tableBody.empty();
            if (!users || !users.length) {
                $tableBody.append('<tr><td colspan="5">No users found.</td></tr>');
                return;
            }
            users.forEach(function (user) {
                var row = [
                    "<tr>",
                    "<td>" + escapeHtml(user.name || "") + "</td>",
                    "<td>" + escapeHtml(user.email || "") + "</td>",
                    "<td>" + escapeHtml(user.role || "") + "</td>",
                    "<td>" + (user.emailVerified ? "Yes" : "No") + "</td>",
                    '<td><a href="admin-user-detail.html?userId=' + encodeURIComponent(user.id) + '">View</a></td>',
                    "</tr>"
                ].join("");
                $tableBody.append(row);
            });
        }

        function loadUsers() {
            getAdminUsers($.trim($search.val() || ""))
                .done(function (payload) {
                    renderUsers(payload.users || []);
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load users.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        }

        $("#admin-search-btn").on("click", function () {
            loadUsers();
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

        if (!userId) {
            showMessage($message, "Missing userId.", true);
            return;
        }

        function renderDetail(payload) {
            var user = payload.user || {};
            $userInfo.html([
                "<p><strong>Name:</strong> " + escapeHtml(user.name || "") + "</p>",
                "<p><strong>Email:</strong> " + escapeHtml(user.email || "") + "</p>",
                "<p><strong>Role:</strong> " + escapeHtml(user.role || "") + "</p>",
                "<p><strong>Email Verified:</strong> " + (user.emailVerified ? "Yes" : "No") + "</p>"
            ].join(""));
        }

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

        function loadTimetableModules() {
            getAdminUserTimetableModules(userId)
                .done(function (payload) {
                    renderModuleTables("#admin-user-modules", payload, { allowApprove: true });
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to load user timetable.";
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
                    loadTimetableModules();
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
                    loadTimetableModules();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Reject failed.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });

        loadDetail();
        loadTimetableModules();
    }

    function toMinute(value) {
        var parts = String(value || "").split(":");
        if (parts.length !== 2) {
            return NaN;
        }
        return Number(parts[0]) * 60 + Number(parts[1]);
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

        function defaultRows() {
            return [{
                startTime: "10:00",
                endTime: "11:00",
                courses: ["", "", "", "", "", "", ""]
            }];
        }

        function normalizeRows(rows) {
            var safeRows = Array.isArray(rows) && rows.length ? rows : defaultRows();
            return safeRows.map(function (row) {
                var courses = Array.isArray(row.courses) ? row.courses.slice(0, 7) : [];
                while (courses.length < 7) {
                    courses.push("");
                }
                return {
                    startTime: row.startTime || "10:00",
                    endTime: row.endTime || "11:00",
                    courses: courses
                };
            });
        }

        function collectRows($module) {
            var rows = [];
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
                var courses = [];
                $tr.find(".row-course").each(function () {
                    courses.push($.trim($(this).val() || ""));
                });
                while (courses.length < 7) {
                    courses.push("");
                }
                rows.push({
                    startTime: startTime,
                    endTime: endTime,
                    courses: courses.slice(0, 7)
                });
            });
            if (!rows.length) {
                throw new Error("At least one time row is required.");
            }
            return rows;
        }

        function renderCourseSelect(selectedValue) {
            var current = $.trim(selectedValue || "");
            var options = ['<option value=""></option>'];
            adminCourseCache.forEach(function (course) {
                var name = $.trim((course && course.name) || "");
                if (!name) {
                    return;
                }
                var isSelected = name === current ? ' selected="selected"' : "";
                options.push('<option value="' + escapeHtml(name) + '"' + isSelected + ">" + escapeHtml(name) + "</option>");
            });
            if (current && adminCourseCache.every(function (course) { return $.trim((course && course.name) || "") !== current; })) {
                options.push('<option value="' + escapeHtml(current) + '" selected="selected">' + escapeHtml(current) + "</option>");
            }
            return '<select class="form-control input-sm row-course">' + options.join("") + "</select>";
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
                rows: collectRows($module)
            };
        }

        function renderModules() {
            $modules.empty();
            if (!modulesState.length) {
                $modules.html('<p>No modules yet. Click + to create one.</p>');
                return;
            }

            modulesState.forEach(function (module) {
                var rows = normalizeRows(module.rows);
                var minDate = formatDateInput(getTodayDate());
                var html = [];
                html.push('<div class="panel panel-default admin-module-card" data-module-id="' + escapeHtml(module.id) + '" style="margin-bottom:20px;">');
                html.push('<div class="panel-heading" style="display:flex;justify-content:space-between;align-items:center;">');
                html.push('<div><strong>Date Range Module</strong></div>');
                html.push('<button type="button" class="btn btn-xs btn-primary" data-add-module-inline="1">+</button>');
                html.push('</div>');
                html.push('<div class="panel-body">');
                html.push('<div class="row" style="margin-bottom:12px;">');
                html.push('<div class="col-sm-4"><label>Start date</label><input type="date" min="' + escapeHtml(minDate) + '" class="form-control module-start-date" value="' + escapeHtml(module.startDate || "") + '"></div>');
                html.push('<div class="col-sm-4"><label>End date</label><input type="date" min="' + escapeHtml(minDate) + '" class="form-control module-end-date" value="' + escapeHtml(module.endDate || "") + '"></div>');
                html.push('<div class="col-sm-4" style="padding-top:24px;"><span class="module-save-state text-muted"></span></div>');
                html.push('</div>');
                html.push('<div class="table-responsive"><table class="table table-bordered"><thead><tr>');
                html.push('<th>Start</th><th>End</th><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th><th>Saturday</th><th>Sunday</th><th>Action</th>');
                html.push('</tr></thead><tbody>');
                rows.forEach(function (row, rowIndex) {
                    html.push('<tr data-row-index="' + rowIndex + '">');
                    html.push('<td><input type="time" class="form-control input-sm row-start-time" value="' + escapeHtml(row.startTime || "10:00") + '"></td>');
                    html.push('<td><input type="time" class="form-control input-sm row-end-time" value="' + escapeHtml(row.endTime || "11:00") + '"></td>');
                    for (var i = 0; i < 7; i += 1) {
                        html.push("<td>" + renderCourseSelect(row.courses[i] || "") + "</td>");
                    }
                    html.push('<td><button type="button" class="btn btn-xs btn-success" data-add-row="1">+</button> <button type="button" class="btn btn-xs btn-danger" data-remove-row="1">-</button></td>');
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
                    modulesState = normalizedModulePayload.modules || [];
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
                showMessage($message, err.message || "Invalid timetable module.", true);
                return $.Deferred().reject().promise();
            }
            $module.find(".module-save-state").text("Saving...");
            return updateAdminTimetableModule(moduleId, payload)
                .done(function () {
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
            if (modulesState.length) {
                var lastEnd = null;
                modulesState.forEach(function (module) {
                    var moduleEnd = parseDateInput(module.endDate);
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
                rows: defaultRows()
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
                '<td><input type="time" class="form-control input-sm row-start-time" value="' + escapeHtml(nextStart) + '"></td>',
                '<td><input type="time" class="form-control input-sm row-end-time" value="' + escapeHtml(nextEnd) + '"></td>'
            ];
            for (var i = 0; i < 7; i += 1) {
                html.push("<td>" + renderCourseSelect("") + "</td>");
            }
            html.push('<td><button type="button" class="btn btn-xs btn-success" data-add-row="1">+</button> <button type="button" class="btn btn-xs btn-danger" data-remove-row="1">-</button></td>');
            html.push("</tr>");
            $row.after(html.join(""));
            saveModule($module);
        });

        $page.on("click", "[data-remove-row='1']", function () {
            var $module = $(this).closest(".admin-module-card");
            var $tbody = $(this).closest("tbody");
            if ($tbody.find("tr").length <= 1) {
                showMessage($message, "At least one time row is required.", true);
                return;
            }
            $(this).closest("tr").remove();
            saveModule($module);
        });

        $page.on("change", ".module-start-date, .module-end-date, .row-start-time, .row-end-time, .row-course", function () {
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
        var $name = $("#admin-course-name");
        var $message = $("#admin-courses-message");
        var $tbody = $("#admin-courses-body");

        function renderCourses(courses) {
            $tbody.empty();
            if (!courses || !courses.length) {
                $tbody.append('<tr><td colspan="2">No courses.</td></tr>');
                return;
            }
            courses.forEach(function (course) {
                $tbody.append(
                    '<tr>' +
                    '<td>' + escapeHtml(course.name || "") + "</td>" +
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

        $("#admin-course-add-btn").on("click", function () {
            var name = $.trim($name.val() || "");
            if (!name) {
                showMessage($message, "Please enter a course name.", true);
                return;
            }
            createAdminCourse({ name: name })
                .done(function () {
                    $name.val("");
                    showMessage($message, "Course added.", false);
                    loadCourses();
                })
                .fail(function (xhr) {
                    var msg = (xhr.responseJSON && xhr.responseJSON.message) || "Failed to add course.";
                    if (Array.isArray(msg)) {
                        msg = msg.join(", ");
                    }
                    showMessage($message, msg, true);
                });
        });

        $(document).on("click", "[data-delete-course]", function () {
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
                    if (String(msg).indexOf("already used in timetable") !== -1) {
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
