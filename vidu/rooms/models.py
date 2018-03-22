# -*- coding: utf-8 -*-
from __future__ import unicode_literals
from django.db import models
from django.contrib.auth.models import User
from django.utils.text import Truncator
from django.core.signing import Signer
from django.urls import reverse


class Profile(models.Model):
	"""
	User profile
	"""
	profile_photo = models.FileField(upload_to="images", null=True, blank=True)
	content_type = models.CharField(max_length=50, null=True, blank=True)
	user = models.OneToOneField(User, on_delete=models.CASCADE)

	def __unicode__(self):
		return 'Entry(id=' + str(self.id) + ')'

	def __str__(self):
		return "Username: " + self.user.username + ", " + "email: " + self.user.email


class Room(models.Model):
	"""
	Room that holds youtube video
	"""
	name = models.CharField(max_length=30)
	video_url = models.CharField(max_length=100)
	room_description = models.CharField(max_length=1000, null=True, blank=True)
	video_id = models.CharField(max_length=100, null=True)
	owner = models.ForeignKey(User, related_name='my_rooms', on_delete=models.CASCADE)
	last_commented = models.DateTimeField(auto_now_add=True)
	created_at = models.DateTimeField(auto_now_add=True)

	signer = Signer(sep='/', salt='rooms.Room')

	def get_absolute_url(self):
		signed_pk = self.signer.sign(self.pk)
		return reverse('shared-room', kwargs={'signed_pk': signed_pk})

	def __str__(self):
		return "Owner: " + self.owner.username + " Name: " + str(self.name) + " URL: " + str(self.video_url)


class Comment(models.Model):
	"""
	Comment in a room
	"""
	message = models.TextField(max_length=500)
	room = models.ForeignKey(Room, related_name='comments', on_delete=models.CASCADE)
	created_by = models.ForeignKey(User, related_name='comments', on_delete=models.CASCADE)
	created_at = models.DateTimeField(auto_now_add=True)
	time_stamp = models.IntegerField()

	def __str__(self):
		truncated_message = Truncator(self.message)
		return truncated_message.chars(30) + " TS: " + str(self.time_stamp)


class Connection(models.Model):
	"""
	Connection betweeen a user and a room
	"""
	created_at = models.DateTimeField(auto_now_add=True)
	room = models.ForeignKey(Room, related_name='connections', on_delete=models.CASCADE)
	user = models.ForeignKey(User, related_name='connections', on_delete=models.CASCADE)
	visible = models.BooleanField(default=False)

	def __str__(self):
		return "Room: " + self.room.name + \
		       " Username: " + self.user.username + \
		       " Visible: " + str(self.visible) + " Created at: " + str(self.created_at)

	class Meta:
		unique_together = ['room', 'user']


class Chat(models.Model):
	"""
	Chat messages. Can be either private chat message or public message in a room
	"""
	"""
		Comment in a room
		"""
	message = models.TextField(max_length=500)
	created_by = models.ForeignKey(User, related_name='chat_sent', on_delete=models.CASCADE)
	directed_to = models.ForeignKey(User, related_name='chat_received', on_delete=models.CASCADE, null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	room = models.ForeignKey(User, related_name='chats', on_delete=models.CASCADE, null=True, blank=True)
	time_stamp = models.IntegerField()

	def __str__(self):
		truncated_message = Truncator(self.message)
		return truncated_message.chars(30) + " TS: " + str(self.time_stamp)


class Notification(models.Model):
	"""
	Notification to a user
	"""
	message = models.TextField(max_length=500, null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	user = models.ForeignKey(User, related_name='notifications', on_delete=models.CASCADE)
