from django import forms
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from django.contrib.auth.models import User


class SignUpForm(UserCreationForm):
	email = forms.CharField(max_length=254, required=False, widget=forms.EmailInput())

	class Meta:
		model = User
		fields = ('username', 'email', 'password1', 'password2')


class UserNameForm(forms.ModelForm):
	email = forms.CharField(max_length=254, required=False, widget=forms.EmailInput(
		attrs={'rows': 1, 'placeholder': 'Email address'}
	))

	# TODO: need to add clean function and check validity of username

	class Meta:
		model = User
		fields = ('username', 'email')
