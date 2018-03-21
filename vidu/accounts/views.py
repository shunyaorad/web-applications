from django.contrib.auth import login as auth_login
from django.http import HttpResponse, Http404
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.forms import AdminPasswordChangeForm, PasswordChangeForm
from django.contrib.auth import update_session_auth_hash
from django.contrib import messages
from social_django.models import UserSocialAuth
import json
from .forms import SignUpForm, UserNameForm
from rooms.models import Profile


def signup(request):
	if request.method == 'POST':
		form = SignUpForm(request.POST)
		if form.is_valid():
			user = form.save()
			profile = Profile(user=user)
			profile.save()
			auth_login(request, user, backend='django.contrib.auth.backends.ModelBackend')
			return redirect('home')
	else:
		form = SignUpForm()
	return render(request, 'accounts/signup.html', {'form': form})


def create_profile(strategy, details, response, user, *args, **kwargs):
	if Profile.objects.filter(user=user).exists():
		pass
	else:
		new_profile = Profile(user=user)
		new_profile.save()

	return kwargs


@login_required
def settings(request):
	user = request.user
	form = UserNameForm(instance=user)

	try:
		github_login = user.social_auth.get(provider='github')
	except UserSocialAuth.DoesNotExist:
		github_login = None

	try:
		twitter_login = user.social_auth.get(provider='twitter')
	except UserSocialAuth.DoesNotExist:
		twitter_login = None

	try:
		facebook_login = user.social_auth.get(provider='facebook')
	except UserSocialAuth.DoesNotExist:
		facebook_login = None

	can_disconnect = (user.social_auth.count() > 1 or user.has_usable_password())

	return render(request, 'accounts/settings.html', {
		'github_login': github_login,
		'twitter_login': twitter_login,
		'facebook_login': facebook_login,
		'can_disconnect': can_disconnect,
		'update_form': form
	})


@login_required
def update_username(request):
	"""
	Ajax way to add new post
	"""
	if request.method != 'POST':
		raise Http404
	# TODO: check if request contains valid fields
	print(request.POST)
	user = request.user
	current_username = user.username
	new_username = request.POST['username']
	form = UserNameForm(request.POST)
	form.fields['email'].required = False
	if current_username == new_username:
		print("username not changed")  # TODO: how to just update email using cleaned_data?
		user.email = form.fields['email']
		response_text = {'result': 'username unchanged. update succeeded'}
	elif form.is_valid():
		print("valid form")
		user.username = form.cleaned_data['username']
		user.email = form.cleaned_data['email']
		user.save()
		response_text = {'result': 'Update succeeded'}
	else:
		print("invalid form")
		response_text = {'result': 'Update failed'}
	return HttpResponse(json.dumps(response_text), content_type='application/json')


@login_required
def password(request):
	if request.user.has_usable_password():
		PasswordForm = PasswordChangeForm
	else:
		PasswordForm = AdminPasswordChangeForm

	if request.method == 'POST':
		form = PasswordForm(request.user, request.POST)
		if form.is_valid():
			form.save()
			update_session_auth_hash(request, form.user)
			messages.success(request, 'Your password was successfully updated!')
			return redirect('password')
		else:
			messages.error(request, 'Please correct the error below.')
	else:
		form = PasswordForm(request.user)
	return render(request, 'accounts/password.html', {'form': form})
