var urlTemplate = "https://www.youtube.com/embed/URL?controls=1&autoplay=1&showinfo=0&rel=0&&loop=1&rel=0";
var player; // youtube video player in html
var videoID; // youtube video ID
var allComments = {};  // {time_tamp : array_of_comments}
var lastPlayingTime = -1; // last playback time
var lastUpdateTime = '0'; // last time comments are updated
var syncMode = false; // true when the user is in playback sync mode
var syncID; // sync ID for the playback sync mode
var syncChannelName; // sync channel name for sync mode
var syncChannel; // sync channel for sync mode
var userSyncChannel; // sync-1-23-channel-2 (syncChannel-userPK)
var syncOwner = false; // true if this user starts sync channel
var myOwnChange = true; // The change in the player state is this user's command
var selectedVisitors = new Set(); // store all selected users on the visitors-sidebar
var numOfSelectedNotReadyForSyncVisitor = 0;
var pusher;
var roomChannel; // room channel for this room
var roomChannelName;
var userRoomChannel; // unique user-room channel for this user and room
var userRoomChannelName;
var myStatus = "online"; // online, offline, sync, busy

/**
 * Function that gets executed repeatedly. Gets called after youtube player is loaded.
 */
function repeatedFunc() {
    showComments();
    // TODO: hacky way of resolving sync problem. Sometimes player stopped and myOwnChange is false. therefore not synced when played again. Refresh needed.
    if (player.getPlayerState() == YT.PlayerState.PAUSED && !myOwnChange) {
        myOwnChange = true;
    }
}

/**
 * Initialize
 */
$(document).ready(function () {
    console.log("initializing");
    getNewComments();
    Pusher.logToConsole = false; // For debugging
    pusher = new Pusher('c45513cf0c7e246ab1e6', {
        encrypted: true
    });
    myStatus = 'online';
    subscribeToRoomChannel(roomPK);
    subscribeToUserRoomChannel(userPK, roomPK);
    videoID = youtube_parser(videoURL);
    setupButtonClickEvents();
});

$(window).on('beforeunload', function (e) {
    myStatus = 'offline';
    notifyLoginStatus(roomChannelName);
    if (syncMode) {
        notifySyncStop();
    }
});


/**
 * Setup buttons/forms events when the page loads.
 */
function setupButtonClickEvents() {
    /**
     * Open chatroom sidebar
     */
    $("#chatroom-sidebar-toggle").click(function (e) {
        e.preventDefault();
        sidebarLogic("#chatroom-sidebar", ["#visitors-sidebar", "#comments-sidebar"])
    });

    $("#chatroom-close").on("click", function (e) {
        e.preventDefault();
        sidebarLogic("#chatroom-sidebar", ["#visitors-sidebar", "#comments-sidebar"])
    });

    /**
     * Open comments sidebar
     */
    $("#comments-sidebar-toggle").click(function (e) {
        e.preventDefault();
        sidebarLogic("#comments-sidebar", ["#chatroom-sidebar", "#visitors-sidebar"])
    });

    $("#comments-close").on("click", function (e) {
        e.preventDefault();
        sidebarLogic("#comments-sidebar", ["#chatroom-sidebar", "#visitors-sidebar"])
    });

    /**
     * Open visitors sidebar
     */
    $("#visitors-sidebar-toggle").click(function (e) {
        e.preventDefault();
        sidebarLogic("#visitors-sidebar", ["#chatroom-sidebar", "#comments-sidebar"])
    });

    $("#visitors-close").on("click", function (e) {
        e.preventDefault();
        sidebarLogic("#visitors-sidebar", ["#chatroom-sidebar", "#comments-sidebar"])
    });

    /**
     * Select user on the sidebar
     */
    $(".sidebar-wrapper").on("click", ".sidebar-user-box", function (event) {
        event.preventDefault();
        var selectedUserPK = $(this).attr('id');
        $(this).toggleClass("toggled");
        if (selectedVisitors.has(selectedUserPK)) {
            selectedVisitors.delete(selectedUserPK);
            if (!isReadyForSync(this)) {
                numOfSelectedNotReadyForSyncVisitor -= 1;
            }
        } else {
            selectedVisitors.add($(this).attr('id'));
            if (!isReadyForSync(this)) {
                numOfSelectedNotReadyForSyncVisitor += 1;
            }
        }
        if (selectedVisitors.size > 0) {
            showVisitorsButtons();
        }
        else if (selectedVisitors.size == 0) {
            hideVisitorsButtons();
        }
    });



    /**
     * Update room asychronusly
     */
    $('#update_room').on('submit', function (event) {
        event.preventDefault();
        updateRoom(roomPK);
    });

    /**
     * Invite user to the room
     */
    $('#invitation_form').on('submit', function (event) {
        event.preventDefault();
        invite(roomPK);
    });

    /**
     * Post comment
     */
    $('#post_comment').on('submit', function (event) {
        event.preventDefault();
        postComment();
    });

    /**
     * Copy shareable link to the clipboard
     */
    $("#shareable-link-button").on('click', function () {
        copyToClipBoard();
    });
}

/**
 * Check if user is ready for sync
 */
function isReadyForSync(sidebarUserBox) {
    var userStatus = $(sidebarUserBox).find(".sidebar-userstatus");
    if (userStatus.hasClass("offline") || userStatus.hasClass("busy") || userStatus.hasClass("sync")) {
        return false;
    }
    return true;
}

/************************************************************************
 * Sidebar functions ****************************************************
 ************************************************************************/
/**
 * Main sidebar logic
 */
function sidebarLogic(mainSidebar, otherSidebar) {
    numOfSelectedNotReadyForSyncVisitor = 0;
    hideVisitorsButtons();
    if (isSidebarOpen(mainSidebar)) {
        closeSidebar(mainSidebar);
    } else {
        if (isSidebarOpen("#wrapper")) {
            hideSidebarContent(otherSidebar[0], "toggled");
            hideSidebarContent(otherSidebar[1], "toggled");
        } else {
            $("#wrapper").addClass("toggled");
        }
        showSidebarContent(mainSidebar);
    }
}

/**
 * Check if sidebar is open
 */
function isSidebarOpen(sidebarName) {
    return $(sidebarName).hasClass("toggled");
}

/**
 * Close the sidebar
 */
function closeSidebar(sidebarName) {
    removeClassIfExists("#wrapper", "toggled");
    removeClassIfExists(sidebarName, "toggled");
}

/**
 * Hide sidebar content (visitors, chatroom, or comments)
 * @param sidebarName: visitors-sidebar, chatroom-sidebar, comments-sidebar
 */
function hideSidebarContent(sidebarName) {
    removeClassIfExists(sidebarName, "toggled");
}

/**
 * Show sidebar content (visitors, chatroom, or comments)
 * @param sidebarName: visitors-sidebar, chatroom-sidebar, comments-sidebar
 */
function showSidebarContent(sidebarName) {
    $(sidebarName).addClass("toggled");
}

/**
 * Deselect all selected visitors on the visitors-sidebar
 */
function deselectAllUsers() {
    $(".sidebar-user-box").each(function () {
        removeClassIfExists(this, "toggled");
    });
    selectedVisitors.clear();
}

/**
 * Show visitors-sidebar bottom buttons (sync, chat)
 */
function showVisitorsButtons() {
    removeButtonColor("#sync-button");
    if (numOfSelectedNotReadyForSyncVisitor > 0) {
        addButtonColor("#sync-button", "btn-danger");
    } else {
        addButtonColor("#sync-button", "btn-dark-green");
    }
    $(".visitors-buttons").addClass("show");
}

function removeButtonColor(button) {
    removeClassIfExists(button, "btn-danger");
    removeClassIfExists(button, "btn-dark-green");
}

function addButtonColor(button, color) {
    $(button).addClass(color);
}

/**
 * Hide visitors-sidebar bottom buttons (sync, chat)
 */
function hideVisitorsButtons() {
    deselectAllUsers();
    removeClassIfExists(".visitors-buttons", "show");
}

/************************************************************************
 * Update room info functions *******************************************
 ************************************************************************/
/**
 * Update room info
 */
function updateRoom(roomPK) {
    $.ajax({
            url: url_to_update_room,
            type: 'POST',
            data: {
                room_pk: roomPK,
                name: $('input#room-name').val(),
                video_url: $('input#video-url').val(),
                room_description: $('input#room-description').val(),
                csrfmiddlewaretoken: getCSRFToken()
            },
            success: function (room) {
                updateRoomTitle(room['name']);
                updateVideoURL(room['video_url']);
                setToastr("toast-top-center", true, '3000');
                toastr.success("Room information updated!");
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

function updateRoomTitle(roomName) {
    $('.room-title').first().text(roomName);
}

function updateVideoURL(newURL) {
    var oldVideoID = youtube_parser(videoURL);
    var newVideoID = youtube_parser(newURL);
    if (oldVideoID != newVideoID) {
        player.cueVideoById(newVideoID);
    }
}

/************************************************************************
 * Invite other users to the room functions *****************************
 ************************************************************************/
/**
 * Invite others to the room
 */
function invite(roomPK) {
    var invited_username = $('input#id_username').val();
    $('input#id_username').val("");
    $.ajax({
            url: url_to_invite,
            type: 'POST',
            data: {
                room_pk: roomPK,
                username: invited_username,
                csrfmiddlewaretoken: getCSRFToken()
            },
            success: function (json) {
                setToastr("toast-bottom-right", true, "5000");
                toastr.success('Invited ' + invited_username);
            },
            error: function (xhr, errmsg, err) {
                setToastr("toast-bottom-right", true, "5000");
                toastr.error("Failed to invite " + invited_username);
            }
        }
    )
}

/************************************************************************
 * Comments related functions *******************************************
 ************************************************************************/
/**
 * Post comment to the video
 */
function postComment() {
    var commentField = $('input#id_message');
    var message = commentField.val();
    commentField.val("");
    var currentTime = Math.round(player.getCurrentTime());  // TODO: round is too rough. get more specific time
    $.ajax({
            url: url_to_post_comment,
            type: 'POST',
            data: {
                room_pk: roomPK,
                message: message,
                time_stamp: currentTime,
                csrfmiddlewaretoken: getCSRFToken()
            },
            success: function (json) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

/**
 * get new comments from database
 */
function getNewComments() {
    $.ajax({
        url: url_to_get_comment,  // defined in room.html
        type: 'GET',
        datatype: 'json',
        data: {
            last_comment_update_time: lastUpdateTime,
            roomPK: roomPK
        },
        success: function (comments) {
            for (var i = 0; i < comments.length; i++) {
                lastUpdateTime = getNewUpdateTime(lastUpdateTime, comments[i]);
            }
            updateComments(comments);
        }
    })
}

/**
 * Update comments to show in the post
 * @param comments
 */
function updateComments(comments) {
    for (var i = 0; i < comments.length; i++) {
        allComments[comments[i]['time_stamp']] = comments[i];
    }
}

/**
 * Get new update time based on the Item's created time
 */
function getNewUpdateTime(lastUpdateTime, Item) {
    if (new Date(lastUpdateTime).getTime() < new Date(Item['created_at']).getTime()) {
        return Item['created_at'];
    } else {
        return lastUpdateTime;
    }
}

/**
 * Show comments on the screen
 */
// TODO: only what to show certain amount of time. Fade away the comments.
function showComments() {
    var currentTime = Math.round(player.getCurrentTime());  // TODO: replace round with something better
    if (lastPlayingTime != currentTime) {
        var commentsToShow = allComments[currentTime];
        if (typeof commentsToShow != 'undefined') {
            displayCommentsOnScreen(commentsToShow);
            lastPlayingTime = currentTime;
        }
    }
}

// TODO: parse the list of comments. Instead of changing whole textContent.
function displayCommentsOnScreen(commentToShow) {
    // var videoScreen = document.getElementsByClassName("vidtop-content")[0];
    var videoScreen = $("#video-content");
    var newCommentHTML = "<div class='vid-comment'><p>" +
        commentToShow['message'] + "</p><p>" + commentToShow['created_by'] + "</p></div>";
    videoScreen.append(newCommentHTML);
    $(function () {
        setTimeout('flow()');
    });
}

/**
 * Make comment flow on the screen
 */
function flow() {
    $(".vid-comment").animate({
        left: "-100px" // end position TODO: change end position based on the length of comment
    }, 6000, function () {
        $(this).remove();
    })
}

/************************************************************************
 * Playback Sync Functions **********************************************
 ************************************************************************/
function syncStateWithOthers(message, channelName) {
    $.ajax({
            url: url_to_send_player_state,
            type: 'GET',
            data: {
                channelName: channelName,
                currState: message['currState'],
                currTime: message['currTime']
            },
            success: function (response) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

/**
 * Start sync with other visitors
 */
function startSync() {
    if (illegalVisitorSelection()) {
        setToastr("toast-bottom-right", true, "0");
        toastr.error('You can only sync with online visitors.');
    }
    else {
        syncID = userPK + "-" + roomPK;
        subscribeToSyncChannel(syncID);
        sendSyncInvitation(syncID, selectedVisitors);
        setToastr("toast-bottom-right", true, "3000");
        toastr.success('Sent sync invitations!');
        deselectAllUsers();
    }
}

/**
 * Check if non online visitors selected
 */
function illegalVisitorSelection() {
    return $("#sync-button").hasClass("btn-danger")
}

/**
 * Call this function when user starts sync mode
 */
function subscribeToSyncChannel(syncID) {
    syncMode = true;
    myStatus = "sync";
    syncChannelName = makeSyncChannelName(syncID);
    syncChannel = pusher.subscribe(syncChannelName);
    var ownerPK = syncChannelName.split("-")[1]; // sync-roomPK-ownerPK-channel
    // if this user is the owner of the sync channel, responsible for initial state of other sync users
    if (ownerPK == userPK) {
        syncOwner = true;
        bindRequestPlaybackEvent();
    } else {
        syncOwner = false;
        // bind to events so that the sync joined user can get initial playback state.
        userSyncChannel = pusher.subscribe(syncChannelName + "-" + userPK);
        bindRequestInitialStateEvent();
        bindReceiveInitialStateEvent();
    }
    // bind to events so that the in-sync users receive changes in states/status of the sync channel
    bindReplySyncInvitationEvent();
    bindStopSyncEvent();
    bindPlaybackChangeEvent();
    notifyLoginStatus(roomChannelName);
    bindSyncDeleteEvent();
    showInSyncButton()
}

/**
 * Answer request for initial state of the sync mode. Owner of the sync channel sends initial state
 */
function bindRequestPlaybackEvent() {
    syncChannel.bind('request_playback_time', function (message) {
        var targetUserPK = message['userPK'];
        $.ajax({
                url: url_to_send_playback_time,
                type: 'GET',
                data: {
                    targetUserPK: targetUserPK,
                    channelName: syncChannelName,
                    state: player.getPlayerState(),
                    time: player.getCurrentTime()
                },
                success: function (response) {
                },
                error: function (xhr, errmsg, err) {
                }
            }
        )
    });
}

/**
 * Receive notice if anyone joins to sync
 */
function bindReplySyncInvitationEvent() {
    syncChannel.bind('reply_sync_invitation', function (message) {
        var replier = message['replier_username'];
        var replier_pk = message['replier_pk'];
        setToastr("toast-bottom-right", true, "10000");
        if (message['message'] == 'accept') {
            if (replier != userName) {
                toastr.success(replier + " is in sync with you.");
            }
        } else {
            toastr.error(replier + " declined to sync with you.");
        }
    });
}

/**
 * Request initial playback state from owner of the sync channel
 */
function bindRequestInitialStateEvent() {
    syncChannel.bind('pusher:subscription_succeeded', function () {
        $.ajax({
                url: url_to_request_playback_time,
                type: 'GET',
                data: {
                    channelName: syncChannelName
                },
                success: function (response) {
                },
                error: function (xhr, errmsg, err) {
                }
            }
        )
    });
}

/**
 * Receive initial playback state from the owner of the sync channel
 */
function bindReceiveInitialStateEvent() {
    userSyncChannel.bind('sync_initial_playback_time', function (message) {
        var initialState = message['state'];
        var initialTime = message['time'];
        player.seekTo(initialTime);
        if (initialState == YT.PlayerState.PAUSED) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    });
}

/**
 * Receive event if anyone stops sync
 */
function bindStopSyncEvent() {
    syncChannel.bind('stop_sync', function (message) {
        var replier = message['replier_username'];
        if (replier != userName) {
            setToastr("toast-bottom-right", true, "10000");
            toastr.error(replier + " stopped sync.");
        }
    });
}

/**
 * Receive change in playback state event
 */
function bindPlaybackChangeEvent() {
    syncChannel.bind('playback-changed', function (playback) {
        var newState = playback['curr_state'];
        var newCurrTime = playback['curr_time'];
        if (messageFromOthers(playback['sender'])) {
            myOwnChange = false;
        } else {
            myOwnChange = true;
        }
        if (!myOwnChange) {
            if (needToSync(newCurrTime)) {
                player.seekTo(newCurrTime);
            }
            if (newState == YT.PlayerState.PAUSED) {
                player.pauseVideo();
            }
            if (newState == YT.PlayerState.PLAYING) {
                player.playVideo();
            }
        }
    });
}

/**
 * Ajax to notify specified channel with my current login status
 */
function notifyLoginStatus(channelName) {
    $.ajax({
            url: url_to_notify_status,
            type: 'GET',
            data: {
                requesterChannelName: channelName,
                status: myStatus
            },
            success: function (response) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    );
}

/**
 * Check if time difference in the playback requires to sync
 */
function needToSync(newCurrTime) {
    return Math.abs(newCurrTime - player.getCurrentTime()) > 0.01;
}

/**
 * Check if the message sender is from myself
 */
function messageFromOthers(sender) {
    return sender != userPK;
}

/**
 * Send sync invitation to the selected users
 */
function sendSyncInvitation(syncID, users) {
    var usersJson = Array.from(users);
    $.ajax({
            url: url_to_send_sync_invitation,
            type: 'GET',
            data: {
                syncID: syncID,
                users: usersJson
            },
            success: function (response) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

/**
 * Show In-Sync button on control-buttons row on top of video
 */
function showInSyncButton() {
    $("#in-sync-button").addClass("show");
}

/**
 *  Stop sync mode. If owner triggered stop, trigger="owner". else trigger = undefined
 */
function stopSync(trigger) {
    syncMode = false;
    myStatus = "online";
    if (syncOwner) {
        deleteSyncChannel();
    }
    var syncChannelName = makeSyncChannelName(syncID);
    pusher.unsubscribe(syncChannelName);
    hideInSyncButton();

    setToastr("toast-bottom-right", true, "0");
    if (trigger == 'owner') {
        toastr.success('Owner stopped sync!');
    }
    toastr.success('Stopped sync!');

    notifySyncStop();
    notifyLoginStatus(roomChannelName);
}

/**
 * Notify other users in the sync channel this user has stopped sync
 */
function notifySyncStop() {
    $.ajax({
            url: url_to_notify_sync_channel,
            type: 'GET',
            data: {
                syncChannelName: syncChannelName,
                eventName: 'stop_sync',
                message: 'stop'
            },
            success: function (response) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    );
}

/**
 * Owner of the sync channel deletes the sync channel. Other users stop sync.
 */
function deleteSyncChannel() {
    $.ajax({
            url: url_to_notify_sync_channel,
            type: 'GET',
            data: {
                syncChannelName: syncChannelName,
                eventName: 'delete-sync',
                message: 'delete-sync-channel'
            },
            success: function (response) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    );
}

/**
 * Bind to stop sync event triggered by owner stop sync
 */
function bindSyncDeleteEvent() {
    syncChannel.bind('delete-sync', function (message) {
        if (!syncOwner) { // stop sync is triggered by the owner. check if this user is the owner
            stopSync("owner");
        }
    });
}

function hideInSyncButton() {
    $("#in-sync-button").removeClass("show");
}

/************************************************************************
 * RoomChannel and UserRoomChannel ***************************************
 ************************************************************************/
/**
 * Subscribe to current room's channel.
 * This channel is responsible for listening to events:
 * 1. room name or video url modified
 * 2. new comment is posted on the video
 * 3. room invitation is accepted by other users
 * 4. notify other users that the user entered the room
 * 5. Other users entered the room
 * 7. Receive change in status event from others
 */
function subscribeToRoomChannel(roomPK) {
    roomChannelName = makeRoomChannelName(roomPK);
    roomChannel = pusher.subscribe(roomChannelName);

    notifyLoginStatus(roomChannelName);
    bindReplyStatusRequestEvent(roomChannel);
    bindRoomModificationEvent(roomChannel);
    bindNewCommentPostedEvent(roomChannel);
    bindInvitationAcceptedEvent(roomChannel);
    bindReceiveCurrentStatusEvent(roomChannel);
}

/**
 * Bind to reply request by others for my status. Reply to the requester's userRoomChannel
 */
function bindReplyStatusRequestEvent() {
    roomChannel.bind('request-status', function (user) {
        var requesterChannelName = user['requesterChannelName'];
        // notify the requester my current status
        notifyLoginStatus(requesterChannelName);
    });
}

/**
 * Bind to room modification event. Modify the room name and video url accordingly.
 */
function bindRoomModificationEvent() {
    roomChannel.bind('room_modified', function (modification) {
        if (modification['type'] == 'modification') {
            updateRoomTitle(modification['name']);
            updateVideoURL(modification['video_url']);
        } else if (modification['type'] == 'delete') {
        }
    });
}

/**
 * Update comments when someone posted comment
 */
function bindNewCommentPostedEvent() {
    roomChannel.bind('comment_posted', function (comment) {
        updateComments([comment])
    });
}

/**
 * Update user sidebar when someone accepted invitation
 * @param roomChannel
 */
function bindInvitationAcceptedEvent() {
    roomChannel.bind('user_accepted', function (user) {
        var visitorList = $(".sidebar-nav");
        var newUserItem = '<div class="sidebar-user-box" id="' + user['pk'] + '">' +
            '<img class="sidebar-user-photo" src="/static/rooms/img/user.jpeg"/>' +
            '<p class="sidebar-username">' + user['name'] + '</p>' +
            '<p class="sidebar-userstatus offline">offline</p>' +
            '</div>';
        visitorList.append(newUserItem);
    })
}

/**
 * Bind to receive status-change event that receives status from other users
 */
function bindReceiveCurrentStatusEvent(channel) {
    channel.bind('status-change', function (user) {
        var userPK = user['pk'];
        var status = user['status'];
        updateUserStatus(userPK, status);
    });
}

/**
 * Update user status in the visitor sidebar
 */
function updateUserStatus(userPK, status) {
    var sidebarStatusName = ".sidebar-user-box#" + userPK + " .sidebar-userstatus";
    removeStatus(sidebarStatusName);
    $(sidebarStatusName).text(status);
    $(sidebarStatusName).addClass(status);
}

/**
 * Remove login status from the element
 */
function removeStatus(element) {
    removeClassIfExists(element, "online");
    removeClassIfExists(element, "offline");
    removeClassIfExists(element, "busy");
    removeClassIfExists(element, "sync");
}

/**
 * Subscribe to the user's unique room channel. (userPK-roomPK)
 * Bind events for
 * 1. request other users in the room to send their status
 * 2. receive other users reply to the request for their status
 * 3. receive invitation of playback sync
 */
function subscribeToUserRoomChannel(userPK, roomPK) {
    userRoomChannelName = makeUserRoomChannel(userPK, roomPK);
    userRoomChannel = pusher.subscribe(userRoomChannelName);

    bindRequestCurrentStatusEvent();
    bindReceiveCurrentStatusEvent(userRoomChannel);
    bindSyncInvitationEvent();
}

/**
 * Request other users in the room to send their current status
 */
function bindRequestCurrentStatusEvent() {
    userRoomChannel.bind('pusher:subscription_succeeded', function () {
        $.ajax({
                url: url_to_request_status,
                type: 'GET',
                data: {
                    roomChannelName: roomChannelName,
                    requesterChannelName: userRoomChannelName
                },
                success: function (response) {
                },
                error: function (xhr, errmsg, err) {
                }
            }
        )
    });
}

/**
 * Bind to request for sync event.
 */
function bindSyncInvitationEvent() {
    userRoomChannel.bind('sync-invited', function (invitation) {
        var requestSyncID = invitation['syncID'];
        var inviter = invitation['username'];
        setToastr("toast-bottom-right", false, "0");
        toastr.success(
            inviter + ' wants to sync with you.' +
            '<a class="btn btn-success" style="padding-right: 20px; padding-left: 20px;" onclick="replySyncInvitation(\'' + "accept\'," + '\'' + requestSyncID + '\')">Accept</a>' +
            '<a class="btn btn-danger" style="padding-right: 20px; padding-left: 20px;" onclick="replySyncInvitation(\'' + "reject\'," + '\'' + requestSyncID + '\')">Reject</a> '
        );
    });
}

/**
 * Reply to sync invitation
 */
function replySyncInvitation(reply, requestSyncID) {
    if (reply == "accept") {
        syncID = requestSyncID;
        subscribeToSyncChannel(syncID);
    }
    toastr.clear(); //TODO: this will clear all toastrs. Clear only the current one.
    sendReplySyncInvitation(requestSyncID, reply);
}

/**
 * Send reply to sync invitation to the sync channel
 */
function sendReplySyncInvitation(requestSyncID, reply) {
    var syncChannelName = makeSyncChannelName(requestSyncID);
    $.ajax({
            url: url_to_notify_sync_channel,
            type: 'GET',
            data: {
                syncChannelName: syncChannelName,
                eventName: 'reply_sync_invitation',
                message: reply
            },
            success: function (response) {
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

/**********************************************************************************
 * Utility ************************************************************************
 **********************************************************************************/

function copyToClipBoard() {
    var copyText = document.getElementById("shareable-link");
    copyText.select();
    document.execCommand("Copy");
    setToastr("toast-bottom-right", true, "3000");
    toastr.success('Link copied to clipboard!');
}

function removeClassIfExists(element, className) {
    if ($(element).hasClass(className)) {
        $(element).removeClass(className);
    }
}

function makeSyncChannelName(syncID) {
    return "sync-" + syncID + "-channel";
}

function makeRoomChannelName(roomPK) {
    return "room-" + roomPK + "-channel";
}

function makeUserRoomChannel(userPK, roomPK) {
    return "userroom-" + userPK + "-" + roomPK + "-channel";
}

/**
 * Set toastr parameters
 */
function setToastr(position, tapToDismiss, timeOut) {
    var progressBar = true;
    if (timeOut == "0") {
        progressBar = false;
    }
    toastr.options = {
        "closeButton": true,
        "positionClass": position,
        "preventDuplicates": true,
        "onclick": null,
        "tapToDismiss": tapToDismiss,
        "showDuration": "300",
        "hideDuration": "1000",
        "timeOut": timeOut,
        "extendedTimeOut": timeOut,
        "progressBar": progressBar,
        "showEasing": "swing",
        "hideEasing": "linear",
        "showMethod": "fadeIn",
        "hideMethod": "fadeOut"
    };
}

//************************************************
//******** Youtube functions ***********************
//************************************************
window.onYouTubeIframeAPIReady = function () {
    console.log("Youtube API is loaded");
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: youtube_parser(videoURL),
        playerVars: {
            showinfo: '1'
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
};


/**
 * The API will call this function when the video player is ready.
 */
function onPlayerReady(event) {
    window.setInterval(repeatedFunc, 500);
}

/**
 * The API calls this function when the player's state changes.
 */
function onPlayerStateChange(event) {
    if (syncMode && (event.data == YT.PlayerState.PLAYING || event.data == YT.PlayerState.PAUSED)) {
        if (myOwnChange) {
            var currState = event.data;
            var currTime = player.getCurrentTime();
            var message = {'currState': currState, 'currTime': currTime};
            var channelName = makeSyncChannelName(syncID);
            syncStateWithOthers(message, channelName) // video playback is changed. check with others and sync time
        } else {
            myOwnChange = true;
        }
    }

}

/**
 * Get video id from youtube url
 */
function youtube_parser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : false;
}

function formatTime(time) {
    time = Math.round(time);

    var minutes = Math.floor(time / 60),
        seconds = time - minutes * 60;

    seconds = seconds < 10 ? '0' + seconds : seconds;

    return minutes + ":" + seconds;
}

/**
 * Get csrf token
 */
function getCSRFToken() {
    var csrftoken = getCookie('csrftoken');
    return csrftoken;
}

function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = jQuery.trim(cookies[i]);
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

