from django.urls import path, include
from rest_framework.routers import DefaultRouter
from diagram.views import *


app_name = "diagram"

router = DefaultRouter()
router.register(r"component", ComponentView)
router.register(r"subcomponent", SubComponentView)
router.register(r"port", PortView)
router.register(r"interface", InterfaceView)
router.register(r"parameter", ParameterView)
router.register(r"parameter-type", ParameterTypeView)

urlpatterns = [
    path('component/<uuid:pk>/diagram/', ComponentView.as_view({"get": "retrieve_diagram"}), name='component-diagram'),
    path('subcomponent/<uuid:pk>/diagram/', SubComponentView.as_view({"get": "retrieve_diagram"}), name='subcomponent-diagram'),
    path('port/<uuid:pk>/diagram/', PortView.as_view({"get": "retrieve_diagram"}), name='port-diagram'),
    path('interface/<uuid:pk>/diagram/', InterfaceView.as_view({"get": "retrieve_diagram"}), name='interface-diagram'),
    path('api/component/<uuid:pk>/diagram/', ComponentView.as_view({"get": "retrieve_diagram"}), name='api-component-diagram'),
    path('api/subcomponent/<uuid:pk>/diagram/', SubComponentView.as_view({"get": "retrieve_diagram"}), name='api-subcomponent-diagram'),
    path('api/port/<uuid:pk>/diagram/', PortView.as_view({"get": "retrieve_diagram"}), name='api-port-diagram'),
    path('api/interface/<uuid:pk>/diagram/', InterfaceView.as_view({"get": "retrieve_diagram"}), name='api-interface-diagram'),
]
