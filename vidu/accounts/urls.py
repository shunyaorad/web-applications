from django.conf.urls import url, include
from django.contrib.auth import views as auth_views

from . import views

urlpatterns = [
    url(r'^signup/$', views.signup, name='signup'),
    url(r'^login/$', auth_views.LoginView.as_view(template_name='accounts/login.html'), name='login'),
    url(r'^logout/$', auth_views.LogoutView.as_view(), name='logout'),
    url(r'^settings/$', views.settings, name='settings'),
    url(r'^settings/password/$', views.password, name='password'),
    url(r'^settings/update/$', views.update_username, name='update_username'),
    url(r'^oauth/', include('social_django.urls', namespace='social')),
    url(r'^password_reset/$', auth_views.password_reset, {'template_name': 'accounts/password_reset_form.html',
                                                          'email_template_name': 'accounts/password_reset_email.html',
                                                          'subject_template_name': 'accounts/password_reset_subject.txt'},
        name='password_reset'),
    url(r'^password_reset/done/$', auth_views.password_reset_done,
        {'template_name': 'accounts/password_reset_done.html'}, name='password_reset_done'),
    url(r'^reset/(?P<uidb64>[0-9A-Za-z_\-]+)/(?P<token>[0-9A-Za-z]{1,13}-[0-9A-Za-z]{1,20})/$',
        auth_views.password_reset_confirm, {'template_name': 'accounts/password_reset_confirm.html'},
        name='password_reset_confirm'),
    url(r'^reset/done/$', auth_views.password_reset_complete,
        {'template_name': 'accounts/password_reset_complete.html'}, name='password_reset_complete'),
    url(r'^password_change/$', auth_views.password_change,{'template_name': 'accounts/password_change_form.html'},
        name='password_change'),
    url(r'^password_change/done/$', auth_views.password_change_done,{'template_name': 'accounts/password_change_complete.html'},
        name='password_change_done'),
]
