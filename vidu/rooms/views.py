from django.shortcuts import render, redirect, get_object_or_404
from django.http import HttpResponse, Http404
from django.core.signing import BadSignature
from .models import Room, Comment, Connection
from django.contrib.auth.models import User
from .forms import NewRoomForm, NewCommentForm, InvitationForm
from django.contrib.auth.decorators import login_required
import json
from django.utils import timezone
from dateutil import parser
import pytz
from datetime import timedelta
from pusher import Pusher
from configparser import ConfigParser
import os
from vidu.settings import BASE_DIR
import urllib.parse as urlparse

config = ConfigParser()
config.read(os.path.join(BASE_DIR, 'config.ini'))

pusher = Pusher(
	app_id=config.get('PUSHER', 'app_id'),
	key=config.get('PUSHER', 'key'),
	secret=config.get('PUSHER', 'secret'),
	ssl=True
)


########################################################################
# Home dashboard related functions
########################################################################
@login_required
def home(request):
	user = request.user
	if request.method == 'POST':
		form = NewRoomForm(request.POST)
		if form.is_valid():
			room = form.save(commit=False)
			room.owner = user
			room.video_id = get_video_id(room.video_url)
			room.save()
			connection = Connection(room=room, user=user, visible=True)
			connection.save()
			return redirect('show_room', pk=room.pk)
	else:
		connections = request.user.connections.all()
		new_room_form = NewRoomForm()
		return render(request, 'rooms/home.html', {'connections': connections, 'new_room_form': new_room_form})


########################################################################
# Room related functions
########################################################################

@login_required
def show_room(request, pk, sync_id=""):
	"""
	Show room with specified pk
	:param pk: room's primary key
	:param sync_channel_name: sync channel name for sync purpose
	"""
	room = get_object_or_404(Room, pk=pk)
	user = request.user
	if not is_room_visible(user, room):
		raise Http404
	if request.method == 'POST':
		form = NewRoomForm(request.POST)
		if form.is_valid():
			room = form.save(commit=False)
			room.owner = user
			room.video_id = get_video_id(room.video_url)
			room.save()
			connection = Connection(room=room, user=user, visible=True)
			connection.save()
			return redirect('show_room', pk=room.pk)
	else:
		new_room_form = NewRoomForm()
		url_form = NewRoomForm(instance=room)
		comment_form = NewCommentForm()
		invitation_form = InvitationForm()
		shareable_link = get_shareable_url(room)
		connections = room.connections.filter(visible=True)
		visible_users = [connection.user for connection in connections if connection.user != user]
		return render(request, 'rooms/room.html', {
			'room': room,
			'url_form': url_form,
			'comment_form': comment_form,
			'invitation_form': invitation_form,
			'new_room_form': new_room_form,
			'shareable_link': shareable_link,
			'visible_users': visible_users,
			'sync_id': sync_id
		})


def is_room_visible(user, room):
	"""
	Check if room is visible to user
	"""
	connection_set = user.connections.filter(room=room)
	if len(connection_set) == 0 or connection_set.first().visible is False:
		return False

	return True


def get_shareable_url(room):
	"""
	Get encrypted absolute url to the room that allows to enter with sign in.
	:param room:
	:return:
	"""
	return "http://localhost:8000" + room.get_absolute_url()


def show_shared_room(request, signed_pk):
	"""
	If signed_pk is valid encrypted pk, show the room
	:param request:
	:param signed_pk:
	:return:
	"""
	try:
		pk = Room.signer.unsign(signed_pk)
		room = Room.objects.get(pk=pk)
		url_form = NewRoomForm(instance=room)
		comment_form = NewCommentForm()
		invitation_form = InvitationForm()

		return render(request, 'rooms/room.html', {
			'room': room,
			'url_form': url_form,
			'comment_form': comment_form,
			'invitation_form': invitation_form
		})

	except (BadSignature, Room.DoesNotExist):
		raise Http404('No room matched your url.')


@login_required
def new_room(request):
	"""
	Make new room
	:param request:
	:return:
	"""
	user = request.user
	if request.method == 'POST':
		form = NewRoomForm(request.POST)
		if form.is_valid():
			room = form.save(commit=False)
			room.owner = user
			room.video_id = get_video_id(room.video_url)
			room.save()
			connection = Connection(room=room, user=user, visible=True)
			connection.save()
			return redirect('show_room', pk=room.pk)
	else:
		form = NewRoomForm()
	return render(request, 'rooms/new_room.html', {'form': form})


@login_required
def update_room(request):
	"""
	Ajax way to update room's name or url to youtube
	"""
	if request.method != 'POST' or not is_fields_in_dict(request.POST, 'room_pk'):
		raise Http404

	room = get_object_or_404(Room, pk=request.POST['room_pk'])
	form = NewRoomForm(request.POST)
	if form.is_valid():
		room.name = form.cleaned_data['name']
		room.video_url = form.cleaned_data['video_url']
		room.video_id = get_video_id(room.video_url)
		room.room_description = form.cleaned_data['room_description']
		room.save()
		response_text = convert_room_info_to_dict(room)
		response_text['type'] = 'modification'
		pusher.trigger(make_room_channel_name(str(room.pk)), 'room_modified', response_text)
	else:
		response_text = {'failed': 'Post is invalid'}

	return HttpResponse(json.dumps(response_text), content_type='application/json')


def make_room_channel_name(room_pk):
	return 'room-' + room_pk + '-channel'


def convert_room_info_to_dict(room):
	"""
	Convert from room object to json which is necessary to display on room.html
	"""
	response_text = {
		'name': room.name,
		'video_url': room.video_url,
		'video_id': room.video_id,
		'owner': room.owner.username,
		'owner_pk': room.owner.pk,
		'room_pk': room.pk,
		'description': room.room_description,
		'created_at': timezone.localtime(room.created_at).strftime("%m/%d/%Y %H:%M:%S"),
	}
	return response_text


@login_required
def invite(request):
	"""
	Invite another user to the room
	:param request:
	:return:
	"""
	if request.method != 'POST' or not is_fields_in_dict(request.POST, 'room_pk'):
		raise Http404

	response_text = {"invited_username": None}
	invitation_form = InvitationForm(request.POST)
	if invitation_form.is_valid():
		room = get_object_or_404(Room, pk=request.POST['room_pk'])
		invited_user = User.objects.filter(username=invitation_form.cleaned_data['username']).first()
		if invited_user == request.user:
			return HttpResponse(json.dumps(response_text), content_type='application/json')
		if not connection_exists(invited_user, room):
			connection = Connection(room=room, user=invited_user, visible=False)
			connection.save()
			connection_dict = convert_connection_to_room_dict(connection)
			channel_name = 'user-' + str(invited_user.pk) + '-channel'
			pusher.trigger(channel_name, 'user_invited', connection_dict)
		response_text["invited_username"] = invited_user.username

	return HttpResponse(json.dumps(response_text), content_type='application/json')


def connection_exists(user, room):
	"""
	Check if there exists connection between user and room
	"""
	return len(user.connections.filter(room=room)) != 0


@login_required
def get_connections(request):
	"""
	Ajax way to get new rooms from database
	:param request:
	:return:
	"""
	if not is_fields_in_dict(request.GET, 'last_connection_update_time'):
		raise Http404

	user = request.user
	last_update_time = convert_to_localized_time(request.GET['last_connection_update_time'])
	new_connections = get_new_objects_since(user.connections, last_update_time)
	response_text = []
	for connection in new_connections:
		parsed_room = convert_connection_to_room_dict(connection)
		response_text.append(parsed_room)

	return HttpResponse(json.dumps(response_text), content_type='application/json')


def get_new_objects_since(query_set, last_update_time):
	"""
	Get list of objects from query_set that are created since the time specified.
	If last_update_time is '0', return all objects
	:param query_set:
	:param last_update_time:
	:return:
	"""
	if last_update_time == '0':
		return query_set.all().order_by('created_at')

	return query_set.filter(created_at__gt=last_update_time).order_by('created_at')


def convert_connection_to_room_dict(connection):
	"""
	Convert from connection object to json which is for home.html
	"""
	response_text = convert_room_info_to_dict(connection.room)
	response_text['visible'] = connection.visible
	response_text['created_at'] = timezone.localtime(connection.created_at).strftime("%m/%d/%Y %H:%M:%S")

	return response_text


@login_required
def respond(request):
	"""
	Respond to invitation to a room
	"""
	user = request.user
	if request.method != 'POST' or not is_fields_in_dict(request.POST, 'response', 'room_pk'):
		raise Http404

	response = request.POST['response']
	room = get_object_or_404(Room, pk=request.POST['room_pk'])
	connection = user.connections.filter(room=room).first()

	if is_accept(response):
		update_accepted_connection(connection)
		response_text = convert_room_info_to_dict(room)
		channel_name = make_room_channel_name(str(room.pk))
		user_dict = convert_user_to_dict(user)
		pusher.trigger(channel_name, 'user_accepted', user_dict)
	else:
		connection.delete()
		response_text = {'response': 'decline'}

	return HttpResponse(json.dumps(response_text), content_type='application/json')


def convert_user_to_dict(user):
	response_text = {
		'name': user.username,
		'pk': user.pk,
	}
	return response_text


def is_accept(response):
	"""
	Check if response to invitation is accept
	:param response:
	:return:
	"""
	return response.lower() == 'accept'


def update_accepted_connection(connection):
	"""
	Update the connection for after user accepted invitation
	"""
	connection.visible = True
	connection.created_at = timezone.now()
	connection.save()


@login_required
def delete_room(request):
	"""
	Delete room specified in request.POST['room_pk']
	"""
	if request.method != 'POST' or not is_fields_in_dict(request.POST, 'room_pk'):
		raise Http404

	user = request.user
	room = get_object_or_404(Room, pk=request.POST['room_pk'])

	if room.owner == user:
		response_text = convert_room_info_to_dict(room)
		response_text['type'] = 'delete'
		pusher.trigger(make_room_channel_name(str(room.pk)), 'room_modified', response_text)
		room.delete()
		response_text = {'response': 'deleted room from database'}
	else:
		delete_user_room_connection(user, room)
		user_dict = convert_user_to_dict(user)
		channel_name = make_room_channel_name(str(room.pk))
		pusher.trigger(channel_name, 'user_deleted', user_dict)
		response_text = {'response': 'deleted from visible_rooms'}

	return HttpResponse(json.dumps(response_text), content_type='application/json')


def delete_user_room_connection(user, room):
	user.connections.filter(room=room).first().delete()


########################################################################
# Comment related functions
########################################################################
@login_required
def post_comment(request):
	"""
	Ajax way to add new post
	"""
	if request.method != 'POST' or not is_fields_in_dict(request.POST, 'room_pk', 'time_stamp'):
		raise Http404

	form = NewCommentForm(request.POST)
	if form.is_valid():
		comment = form.save(commit=False)
		comment.created_by = request.user
		comment.room = get_object_or_404(Room, pk=request.POST['room_pk'])
		comment.time_stamp = request.POST['time_stamp']
		comment.save()
		response_text = convert_comment_to_dict(comment)
		channel_name = make_room_channel_name(str(comment.room.pk))
		pusher.trigger(channel_name, 'comment_posted', response_text)
	else:
		response_text = {'failed': 'Post is invalid'}
	return HttpResponse(json.dumps(response_text), content_type='application/json')


@login_required
def get_comment(request):
	"""
	Ajax way to get new comments from database
	:param request:
	:return:
	"""
	if request.method != 'GET' or is_fields_in_dict(request.GET, 'last_comment_update_time', 'room_pk'):
		return HttpResponse(json.dumps({}), content_type='application/json')

	room = get_object_or_404(Room, pk=request.GET['roomPK'])
	last_update_time = convert_to_localized_time(request.GET['last_comment_update_time'])
	new_comments = get_new_objects_since(Comment.objects.filter(room=room), last_update_time)
	response_text = []
	for comment in new_comments:
		parsed_comment = convert_comment_to_dict(comment)
		response_text.append(parsed_comment)
	return HttpResponse(json.dumps(response_text), content_type='application/json')


def convert_comment_to_dict(comment):
	"""
	Convert from post object to json which contains created user info
	"""
	response_text = {
		'message': comment.message,
		'time_stamp': comment.time_stamp,
		'created_by_pk': comment.created_by.pk,
		'created_by': comment.created_by.username,
		'comment_pk': comment.pk,
		'created_at': timezone.localtime(comment.created_at).strftime("%m/%d/%Y %H:%M:%S"),
		'room_pk': comment.room.pk
	}
	return response_text


########################################################################
# Sync mode related functions
########################################################################
def send_player_state(request):
	if request.method == 'GET':
		channel_name = request.GET['channelName']
		curr_state = request.GET['currState']
		curr_time = request.GET['currTime']
		response_text = {'curr_state': curr_state, 'curr_time': curr_time, 'sender': request.user.pk}
		pusher.trigger(channel_name, 'playback-changed', response_text)
	else:
		response_text = {'result': 'failed'}
	return HttpResponse(json.dumps(response_text), content_type='application/json')


def request_playback_time(request):
	if request.method == 'GET':
		channel_name = request.GET['channelName']
		response_text = {'request': 'current_time', 'userPK': request.user.pk}
		pusher.trigger(channel_name, 'request_playback_time', response_text)
	else:
		response_text = {'result': 'failed'}
	return HttpResponse(json.dumps(response_text), content_type='application/json')


def send_playback_time(request):
	if request.method == 'GET':
		channel_name = request.GET['channelName'] + "-" + request.GET['targetUserPK']
		response_text = {'state': request.GET['state'], 'time': request.GET['time']}
		pusher.trigger(channel_name, 'sync_initial_playback_time', response_text)
	else:
		response_text = {'result': 'failed'}
	return HttpResponse(json.dumps(response_text), content_type='application/json')


def send_sync_invitation(request):
	response_text = {'message': 'send sync invitation'}
	if request.method == 'GET':
		sync_id = request.GET['syncID']
		response_text['syncID'] = sync_id
		response_text['user_pk'] = request.user.pk
		response_text['username'] = request.user.username
		room_pk = sync_id.split("-")[1]
		users = request.GET.getlist('users[]')
		channels = []
		for user in users:
			channels.append(make_user_channel_name(user, room_pk))
		pusher.trigger(channels, 'sync-invited', response_text)
	return HttpResponse(json.dumps(response_text), content_type='application/json')


def notify_sync_channel(request):
	replier_username = request.user.username
	replier_pk = request.user.pk
	response_text = {'replier_username': replier_username, 'replier_pk': replier_pk}
	if request.method == 'GET':
		message = request.GET['message']
		response_text['message'] = message
		requester_channel = request.GET['syncChannelName']
		event_name = request.GET['eventName']
		pusher.trigger(requester_channel, event_name, response_text)
	return HttpResponse(json.dumps(response_text), content_type='application/json')


def make_user_channel_name(user_pk, room_pk):
	return 'user-' + user_pk + '-channel'


def make_user_room_channel_name(user_pk, room_pk):
	return 'userroom-' + user_pk + '-' + room_pk + '-channel'


def request_status(request):
	user = request.user
	response_text = {}
	if request.method == 'GET':
		user_channel = request.GET['userChannelName']
		requester_channel = request.GET['requesterChannelName']
		response_text = convert_user_to_dict(user)
		response_text['requesterChannelName'] = requester_channel
		pusher.trigger(user_channel, 'request-status', response_text)

	return HttpResponse(json.dumps(response_text), content_type='application/json')


def notify_status(request):
	user = request.user
	response_text = {}
	if request.method == 'GET':
		requester_room_channel = request.GET['requesterChannelName']
		status = request.GET['status']
		response_text = convert_user_to_dict(user)
		response_text['status'] = status
		pusher.trigger(requester_room_channel, 'status-change', response_text)

	return HttpResponse(json.dumps(response_text), content_type='application/json')


########################################################################
# Utility functions
########################################################################
def get_video_id(video_url):
	"""
	Get video id from youtube url
	"""
	url_data = urlparse.urlparse(video_url)
	query = urlparse.parse_qs(url_data.query)
	try:
		video_id = query["v"][0]
	except KeyError:
		video_id = "NONE"
	return video_id


def is_fields_in_dict(query_dict, *fields):
	"""
	Return True if all field in fields are in the request_dict
	"""
	return all(field in query_dict.dict() for field in fields)


def convert_to_localized_time(time_str):
	"""
	Convert time_str from javascript to python localized time object.
	If time_str is '0', just return '0' indicating time str is never updated before.
	"""
	if time_str == '0':
		return '0'

	last_update_time = parser.parse(time_str)
	last_update_time = pytz.timezone('US/Eastern').localize(last_update_time)
	# TODO: fix this time hack
	last_update_time += timedelta(0, 1)

	return last_update_time
