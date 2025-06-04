import pytest
from tests.factories import  SubComponentFactory, ComponentFactory, VersionFactory
import uuid6 as uuid
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils.datastructures import MultiValueDict
import json


pytestmark = pytest.mark.django_db

class Test_SubComponentView:
    endpoint = "/api/subcomponent/"

    def test_list(self, component_factory, sub_component_factory, api_client):
        # Arrange
        component = component_factory()
        sub_component_factory(component=component)

        # Act
        response = api_client().get(self.endpoint)

        # Assert
        assert response.status_code == 200
        assert len(response.data) >= 1  # Vérifie qu'il y a au moins un sous-composant

    def test_retrieve(self, component_factory, sub_component_factory, api_client):
        component = component_factory()
        subcomponent = sub_component_factory(component=component)

        response = api_client().get(f"{self.endpoint}{subcomponent.id}/")
        assert response.status_code == 200
    
    def test_create(self, api_client):
        version = VersionFactory()
        component = ComponentFactory()

        with open('tests/assets/lalalala.png', 'rb') as f:
            image_data = f.read()

        uploaded_file = SimpleUploadedFile(
            name='lalalala.png',
            content=image_data,
            content_type='image/png'
        )


        data = {
            "name": "SubComponent",
            "description": "description",
            "availability": "False",
            "confidentiality": "False",
            "integrity": "True",
            "version": str(version.uuid),
            "notes": "",
            "files": uploaded_file,
            "images": '[{"uuid":"","default":1}]',
            "parameters": json.dumps([{"name":"zdzdazd","value":"asdasdsd","secret":False,"parameter_type":"0195fbd5-5a25-7278-9dd8-6b5dea203f40"}]),
            "component": str(component.id),
        }

        print(f"Sending data: {data}")

        response = api_client().post(
            self.endpoint,
            data=data,
            format="multipart",
        )

        print("Status:", response.status_code)
        print("Response:", response.content)

        assert response.status_code == 201
        assert response.data["name"] == "SubComponent"
        assert response.data["description"] == "description"
        assert response.data["availability"] == False
        assert response.data["confidentiality"] == False
        assert response.data["integrity"] == True
        assert response.data["notes"] == ""
        assert len(response.data["images"]) == 1
        assert response.data["parameters"] is not None
        assert str(response.data["component"]) == str(component.id)

    def test_update(self, component_factory, sub_component_factory, api_client):
        component = component_factory()
        subcomponent = sub_component_factory(component=component)
        

        data = {
            "name": "Updated SubComponent",
            "description": "Updated description",
            "availability": True,
            "confidentiality": True,
            "integrity": False,
            "version": str(subcomponent.version.uuid),
            "notes": "Updated notes",
            "images": "[]",
            "parameters": "[]",
            "component": str(subcomponent.component.id),
        }

        print(f"Sending data: {data}")

        response = api_client().put(
            f"{self.endpoint}{subcomponent.id}/",
            data,
            
            format="multipart",
        )

        print(f"Status: {response.status_code}")
        print(f"Content: {response.content}")

        assert response.status_code == 200
        assert response.data["name"] == "Updated SubComponent"
        assert response.data["description"] == "Updated description"
        assert response.data["availability"] == True
        assert response.data["confidentiality"] == True
        assert response.data["integrity"] == False
        assert response.data["notes"] == "Updated notes"
        assert response.data["images"] == []

    def test_destroy(self, sub_component_factory, api_client):
        subcomponent = sub_component_factory()     
        response = api_client().delete(f"{self.endpoint}{subcomponent.id}/")  
        assert response.status_code == 204


