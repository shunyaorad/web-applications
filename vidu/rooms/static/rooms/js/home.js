window.onload = initialize();
Pusher.logToConsole = false; // For debugging
var pusher;
var userChannel;
var userChannelName;
var myStatus = 'online';


// Initialize tooltips
$(function () {
    $('[data-toggle="tooltip"]').tooltip()
});

function initialize() {
    // Reload the page if the user used back button
    if (performance.navigation.type == 2) {
        location.reload(true);
    }
    console.log("initializing");

    Pusher.logToConsole = true; // For debugging
    pusher = new Pusher('c45513cf0c7e246ab1e6', {
        encrypted: true
    });
    myStatus = 'online';
    setupUserChannel();
    setupRoomChannel();
    notifyLoginStatus(userChannelName);
}

$(window).on('beforeunload', function (e) {
    myStatus = 'offline';
    notifyLoginStatus(userChannelName);
});

function setupUserChannel() {
    subscribeToUserChannel(userPK);
    bindReplyStatusRequestEvent();
    bindSyncInvitationEvent();
}

function subscribeToUserChannel(userPK) {
    userChannelName = makeUserChannelName(userPK);
    userChannel = pusher.subscribe(userChannelName);
    userChannel.bind('user_invited', function (invitation) {
        console.log("received invitation message:");
        console.log(invitation);
        subscribeToRoomChannel(invitation['room_pk']);
        showInvitation(invitation)
    });
}

function makeUserChannelName(userPK) {
    return "user-" + userPK + "-channel";
}

function setupRoomChannel() {
    $('.connection').each(function (i, obj) {
        var roomPK = $(this).attr('id');
        subscribeToRoomChannel(roomPK);
    });
}

function subscribeToRoomChannel(roomPK) {
    var channelName = makeRoomChannelName(roomPK);
    var roomChannel = pusher.subscribe(channelName);
    roomChannel.bind('room_modified', function (modification) {
        console.log("room " + roomPK + " is modified:");
        console.log(modification);
        if (modification['type'] == 'modification') {
            console.log('modify room parameter');
            $('#' + modification['room_pk'] + " .room-name").text(modification['name']);
            $('#' + modification['room_pk'] + " .room-url").text(modification['video_url']);
        } else if (modification['type'] == 'delete') {
            console.log('room deleted by owner');
            $('#' + modification['room_pk']).remove();
        }
    });
}

function makeRoomChannelName(roomPK) {
    return "room-" + roomPK + "-channel";
}


/**
 * Insert room row to the room table
 */
function showRoom(room) {
    var roomURL = url_to_show_room.replace(/0/, room['room_pk']);  // make url to the room
    var visibleRoomTable = $(".card-list");
    var newRoomHTML =
        '<div class="visible-room connection room-card col-lg-4 col-md-12">' +
        '<div class="card" style="margin-top: 28px">' +
        '<div class="view">' +
        '<img src="http://img.youtube.com/vi/' + room['video_id'] + '/mqdefault.jpg"' + ' class="img-fluid">' +
        '<a href="' + roomURL + '">' + '<div class="mask rgba-white-slight"></div></a>' +
        '</div>' +
        '<div class="card-body">' + '<h5 class="pink-text"><i class="fas fa-user-circle"></i> ' + room['owner'] + '</h5>' +
        '<a class="close" name="' + room['room_pk'] + '">' +
        '<i class="fa fa-times faa-shake animated-hover" data-toggle="modal" data-target="#modalConfirmDelete"></i>' +
        '</a>' +
        '<div class="modal fade" id="modalConfirmDelete" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">' +
        '<div class="modal-dialog modal-sm modal-notify modal-danger" role="document">' +
        '<div class="modal-content text-center">' +
        '<div class="modal-header d-flex justify-content-center">' +
        '<p class="heading">Are you sure to delete the room ' + room['name'] + '?</p>' +
        '</div>' +
        '<div class="modal-body">' +
        '<i class="fa fa-times fa-4x animated rotateIn"></i>' +
        '</div>' +
        '</div></div></div>' +
        '<h4 class="card-title">' + '<a href="' + roomURL + '">' + room['name'] + '</a></h4>' +
        '<p>' + room['description'] + '</p>' +
        '</div></div></div>';

    var confirmDeleteModal =
        '<div class="modal fade" id="' + room['room_pk'] + '" tabindex="-1" role="dialog" ' +
        'aria-labelledby="exampleModalLabel" aria-hidden="true">' +
        '<div class="modal-dialog modal-sm modal-notify modal-danger" role="document">' +
        '<div class="modal-content text-center">' +
        '<div class="modal-header d-flex justify-content-center">' +
        '<p class="heading">Are you sure to delete the room ' + room['name'] + '?</p>' +
        '</div>' +
        '<div class="modal-body">' +
        '<i class="fa fa-times fa-4x animated rotateIn"></i>' +
        '</div>' +
        '<div class="modal-footer flex-center">' +
        '<a class="btn  btn-outline-danger" data-dismiss="modal" ' +
        'name="' + room['room_pk'] + '" ' +
        'onClick="deleteRoomPush(event)">' +
        'Yes' +
        '</a>' +
        '<a class="btn  btn-danger" data-dismiss="modal">' +
        'No' +
        '</a>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';

    newRoomHTML += confirmDeleteModal;

    if (invitationExists()) {
        $(newRoomHTML).insertBefore($(".invitation").first());
    } else {
        visibleRoomTable.append(newRoomHTML);
    }
}

/**
 * Check if the user has invitation in the table
 */
function invitationExists() {
    return $(".invitation").length != 0
}

/**
 * Delete room button
 */
function deleteRoomPush(event) {
    $('.modal-backdrop').remove();
    var srcElement = event.srcElement;
    var roomToDelete = $(srcElement).closest("a").attr('name');
    deleteRoom(roomToDelete, srcElement);
}

/**
 * Ajax to delete room
 */
function deleteRoom(roomToDeletee, srcElement) {
    $.ajax({
            url: url_to_delete_room,
            type: 'POST',
            data: {
                room_pk: roomToDeletee,
                csrfmiddlewaretoken: getCSRFToken()
            },
            success: function (json) {
                $(srcElement).closest(".room-card").remove(); // remove the row
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

/**
 * Show invitation row in the table
 * @param invitation
 */
function showInvitation(room) {
    console.log("showing invitation");
    var visibleRoomTable = $(".card-list");
    var newInvitationHTML = '<div class="invitation connection room-card col-lg-4 col-md-12">' +
        '<div class="card" style="margin-top: 28px">' +
        '<div class="view">' +
        '<img src="http://img.youtube.com/vi/' + room['video_id'] + '/mqdefault.jpg"' + ' class="img-fluid">' +
        '</div>' +
        '<div class="card-body">' + '<h5 class="pink-text"><i class="fas fa-user-circle"></i> ' + room['owner'] + '</h5>' +
        '<h4 class="card-title">' + room['name'] + '</h4>' +
        '<p>' + room['description'] + '</p>' +
        '<input onClick="respond_invitation(event)" type="submit" class="btn btn-primary invitation-response" value="Accept" name="' + room['room_pk'] + '">' +
        '<input onClick="respond_invitation(event)" type="submit" class="btn btn-danger invitation-response" value="Reject" name="' + room['room_pk'] + '">' +
        '</div></div></div>';
    if (roomExists()) {
        console.log("visible room exists. append after");
        $(newInvitationHTML).insertAfter($(".visible-room").last());
    } else {
        console.log("no visible room exists. appeend invitation");
        visibleRoomTable.append(newInvitationHTML);
    }
}

/**
 * Check if the page has any room that is visible to the user
 */
function roomExists() {
    return $(".visible-room").length != 0;
}

/**
 * Button to respond to the invitation
 */
function respond_invitation(event) {
    event.preventDefault();
    var srcElement = event.srcElement;
    var response = srcElement.value;  // Accept or Decline
    var response_room_pk = srcElement.name;
    respond(response_room_pk, response, srcElement);
}

/**
 * Ajax to send invitation
 */
function respond(responseRoomPK, response, srcElement) {
    var channelName = makeRoomChannelName(responseRoomPK);
    $.ajax({
            url: url_to_respond,
            type: 'POST',
            data: {
                room_pk: responseRoomPK,
                response: response,
                channel: channelName,
                csrfmiddlewaretoken: getCSRFToken()
            },
            success: function (room) {
                $(srcElement).closest(".room-card").remove(); // remove the invitation
                if (response == 'Accept') {
                    console.log("accepted invitation");
                    console.log(room);
                    showRoom(room);
                    subscribeToRoomChannel(room['room_pk']);
                }
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}


/************************************************************************
 * Login status related functions
 ************************************************************************/
/**
 * Bind to reply request by others for my status. Reply to the requester's userRoomChannel
 */
function bindReplyStatusRequestEvent() {
    userChannel.bind('request-status', function (user) {
        var requesterChannelName = user['requesterChannelName'];
        // notify the requester my current status
        notifyLoginStatus(requesterChannelName);
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

/************************************************************************
 * Sync related functions
 ************************************************************************/

/**
 * Bind to request for sync event.
 */
function bindSyncInvitationEvent() {
    userChannel.bind('sync-invited', function (invitation) {
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
    toastr.clear(); //TODO: this will clear all toastrs. Clear only the current one.
    sendReplySyncInvitation(requestSyncID, reply);
}

function jumpToRoomWithSyncMode(syncID) {
    var jumpRoomPK = syncID.split("-")[1];
    var roomURL = url_to_show_room.replace(/0/, jumpRoomPK) + syncID;
    console.log("Jumping to " + roomURL);
    document.location.href = roomURL;
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
                if (reply == 'accept') {
                    jumpToRoomWithSyncMode(requestSyncID);
                }
            },
            error: function (xhr, errmsg, err) {
            }
        }
    )
}

function makeSyncChannelName(syncID) {
    return "sync-" + syncID + "-channel";
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