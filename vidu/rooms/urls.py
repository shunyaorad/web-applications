from django.conf.urls import url
from . import views

urlpatterns = [
	url(r'^$', views.home, name='home'),
	url(r'^rooms/(?P<pk>\d+)/$', views.show_room, name='show_room'),
	url(r'^rooms/(?P<pk>\d+)/(?P<sync_id>[A-Za-z0-9_=-]+)/$', views.show_room, name='show_room'),
	url(r'^rooms/(?P<signed_pk>[0-9]+/[A-Za-z0-9_=-]+)/$', views.show_shared_room, name='shared-room'),
	url(r'^new_room/$', views.new_room, name='new_room'),
	url(r'^update_room/$', views.update_room, name='update_room'),
	url(r'^post_comment/$', views.post_comment, name='post_comment'),
	url(r'^get_comment/$', views.get_comment, name='get_comment'),
	url(r'^request_status/$', views.request_status, name='request_status'),
	url(r'^notify_status/$', views.notify_status, name='notify_status'),
	url(r'^send_player_state/$', views.send_player_state, name='send_player_state'),
	url(r'^request_playback_time/$', views.request_playback_time, name='request_playback_time'),
	url(r'^send_playback_time/$', views.send_playback_time, name='send_playback_time'),
	url(r'^send_sync_invitation/$', views.send_sync_invitation, name='send_sync_invitation'),
	url(r'^notify_sync_channel/$', views.notify_sync_channel, name='notify_sync_channel'),
	url(r'^invite/$', views.invite, name='invite'),
	url(r'^respond/$', views.respond, name='respond'),
	url(r'^get_connection/$', views.get_connections, name='get_connections'),
	url(r'^delete_room/$', views.delete_room, name='delete_room'),
]
