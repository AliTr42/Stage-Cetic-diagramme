import pytest
from tests.factories import SubComponentFactory, ComponentFactory, VersionFactory, PortFactory, InterfaceFactory
import uuid6 as uuid
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.datastructures import MultiValueDict
import json


pytestmark = pytest.mark.django_db

class Test_InterfaceView:
    endpoint = "/api/interface/"

    def test_list(self, interface_factory, api_client):
        # Arrange
        interface_factory()  # Par défaut, une interface externe est créée

        # Act
        response = api_client().get(self.endpoint)

        # Assert
        assert response.status_code == 200
        assert len(response.data) >= 1

    def test_retrieve(self, interface_factory, api_client):
        interface = interface_factory()
        response = api_client().get(f"{self.endpoint}{interface.id}/")
        assert response.status_code == 200
    
    def test_create_external_interface(self, component_factory, port_factory, api_client):
        # Créer les éléments nécessaires
        component = component_factory()
        port_from = port_factory(component=component)
        port_to = port_factory(component=component)
        
        with open('tests/assets/lalalala.png', 'rb') as f:
            image_data = f.read()

        uploaded_file = SimpleUploadedFile(
            name='lalalala.png',
            content=image_data,
            content_type='image/png'
        )

        # Données pour une interface externe
        data = {
            "name": "External Interface",
            "description": "External interface description",
            "availability": "False",
            "confidentiality": "False", 
            "integrity": "True",
            "notes": "",
            "type": "external",
            "port_from": str(port_from.id),
            "port_to_port": str(port_to.id),
            "files": uploaded_file,
            "images": '[{"uuid":"","default":1}]',
            "parameters": json.dumps([{"name":"param_name","value":"param_value","secret":False,"parameter_type":"0195fbd5-5a25-7278-9dd8-6b5dea203f40"}])
        }

        print(f"Sending data: {data}")
        
        response = api_client().post(
            self.endpoint,
            data=data,
            format="multipart",
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content: {response.content}")
        
        # Assertions
        assert response.status_code == 201
        assert response.data["name"] == "External Interface"
        assert response.data["description"] == "External interface description"
        assert response.data["type"] == "external"
        assert str(response.data["port_from"]) == str(port_from.id)
        assert str(response.data["port_to_port"]) == str(port_to.id)
        assert response.data["port_to_subcomponent"] is None
    
    def test_create_internal_interface(self, component_factory, port_factory, sub_component_factory, api_client):
        # Créer les éléments nécessaires
        component = component_factory()
        port_from = port_factory(component=component)
        subcomponent = sub_component_factory(component=component)
        
        with open('tests/assets/lalalala.png', 'rb') as f:
            image_data = f.read()

        uploaded_file = SimpleUploadedFile(
            name='lalalala.png',
            content=image_data,
            content_type='image/png'
        )

        # Données pour une interface interne
        data = {
            "name": "Internal Interface",
            "description": "Internal interface description",
            "availability": "False",
            "confidentiality": "False", 
            "integrity": "True",
            "notes": "",
            "type": "internal",
            "port_from": str(port_from.id),
            "port_to_subcomponent": str(subcomponent.id),
            "files": uploaded_file,
            "images": '[{"uuid":"","default":1}]',
            "parameters": json.dumps([{"name":"param_name","value":"param_value","secret":False,"parameter_type":"0195fbd5-5a25-7278-9dd8-6b5dea203f40"}])
        }

        print(f"Sending data: {data}")
        
        response = api_client().post(
            self.endpoint,
            data=data,
            format="multipart",
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content: {response.content}")
        
        # Assertions
        assert response.status_code == 201
        assert response.data["name"] == "Internal Interface"
        assert response.data["description"] == "Internal interface description"
        assert response.data["type"] == "internal"
        assert str(response.data["port_from"]) == str(port_from.id)
        assert response.data["port_to_port"] is None
        assert str(response.data["port_to_subcomponent"]) == str(subcomponent.id)
    
    def test_update_internal_interface_properties(self, component_factory, port_factory, sub_component_factory, interface_factory, api_client):
        # Créer une interface INTERNE
        component = component_factory()
        port_from = port_factory(component=component)
        subcomponent = sub_component_factory(component=component)
        
        # Créer une interface de type internal
        interface = interface_factory(
            type="internal",
            port_from=port_from, 
            port_to_port=None,
            port_to_subcomponent=subcomponent
        )
        
        # Données pour une mise à jour des propriétés sans changer le type
        data = {
            "name": "Updated Interface Name",
            "description": "Updated description for internal interface",
            "availability": "True",
            "confidentiality": "True", 
            "integrity": "False",
            "notes": "Updated notes",
            "type": "internal",  # garde le même type
            "port_from": str(port_from.id),
            "port_to_subcomponent": str(subcomponent.id),  # garde la même référence au sous-composant
            "port_to_port": "",  # reste vide pour une interface interne
            "images": "[]",
            "parameters": json.dumps([{"name":"updated_param","value":"new_value","secret":True,"parameter_type":"0195fbd5-5a25-7278-9dd8-6b5dea203f40"}])
        }
        
        print(f"Sending update data: {data}")
        
        response = api_client().put(
            f"{self.endpoint}{interface.id}/",
            data=data,
            format="multipart",
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content: {response.content}")
        
        # Assertions
        assert response.status_code == 200
        assert response.data["name"] == "Updated Interface Name"
        assert response.data["description"] == "Updated description for internal interface"
        assert response.data["type"] == "internal"  # Le type doit rester interne
        assert response.data["port_to_port"] is None
        assert str(response.data["port_to_subcomponent"]) == str(subcomponent.id)
    
    def test_destroy(self, interface_factory, api_client):
        interface = interface_factory()
        response = api_client().delete(f"{self.endpoint}{interface.id}/")
        assert response.status_code == 204