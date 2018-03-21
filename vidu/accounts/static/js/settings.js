/**
 * Update room asychronusly
 */
$('#profile-update-form').on('submit', function (event) {
    event.preventDefault();
    updateUser();
});

/**
 * Ajax to update room info
 */
function updateUser() {
    var username_input = $('input#id_username');
    var new_username = username_input.val();
    var email_input = $('input#id_email');
    var new_email = email_input.val();
    $.ajax({
            url: url_to_update_username,
            type: 'POST',
            data: {
                username: new_username,
                email: new_email,
                csrfmiddlewaretoken: getCSRFToken()
            },
            success: function (json) {
                alert(json['result'])
            },
            error: function (xhr, errmsg, err) {
                console.log(errmsg);
            }
        }
    )
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

