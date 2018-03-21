from django import forms
from .models import Room, Comment, Connection


class NewRoomForm(forms.ModelForm):
	name = forms.CharField(
		widget=forms.TextInput(
			attrs={'rows': 1, 'placeholder': 'What is name of the room?'}
		),
		max_length=100,
		help_text='The max length of the text is 100.'
	)

	video_url = forms.CharField(
		widget=forms.TextInput(
			attrs={'rows': 1, 'placeholder': 'URL of the youtube video i.e. https://www.youtube.com/xHadb'}
		),
		max_length=100,
		help_text='The max length of the text is 100.'
	)

	room_description = forms.CharField(
		widget=forms.TextInput(
			attrs={'rows': 3, 'placeholder': 'Add room description!'}
		),
		max_length=1000,
		help_text='The max length of the text is 1000.'
	)

	class Meta:
		model = Room
		fields = ['name', 'video_url', 'room_description']


class NewCommentForm(forms.ModelForm):
	message = forms.CharField(
		widget=forms.TextInput(
			attrs={'rows': 1, 'placeholder': 'Post comment on the video!'}
		),
		max_length=500,
		help_text='The max length of the text is 500.'
	)

	class Meta:
		model = Comment
		fields = ['message']


class InvitationForm(forms.ModelForm):
	username = forms.CharField(
		widget=forms.TextInput(
			attrs={'rows': 1, 'placeholder': 'Who do you want to invite to this room?'}
		),
		max_length=20,
	)

	class Meta:
		model = Connection
		fields = ['username']
