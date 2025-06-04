import pytest
from tests.factories import  ComponentFactory, VersionFactory
import uuid6 as uuid
from django.core.files.uploadedfile import SimpleUploadedFile
import json

 
pytestmark = pytest.mark.django_db

class Test_ComponentView:
    endpoint = "/api/component/"

    def test_list(self, component_factory, api_client):
        # Arrange
        component_factory()

        # Act
        response = api_client().get(self.endpoint)

        # Assert
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["name"] == "Component"
        assert response.data[0]["description"] == "description"
    
    def test_retrieve(self, component_factory, api_client):
        component_factory()
        component = component_factory()
        response = api_client().get(f"{self.endpoint}{component.id}/")
        assert response.status_code == 200
    
    def test_create(self, api_client):
        version = VersionFactory()
        
        with open('tests/assets/lalalala.png', 'rb') as f:
            image_data = f.read()
        
        uploaded_file = SimpleUploadedFile(
            name='lalalala.png',
            content=image_data,
            content_type='image/png'
        )
        images = [("files",uploaded_file)]
        
        data = {
            "name": "Component",
            "description": "description",
            "availability": "False",  
            "confidentiality": "False", 
            "integrity": "True",
            "version": str(version.uuid), 
            "notes": "",
            "files": uploaded_file,
            "images": '[{"uuid":"","default":1}]',
            "parameters": json.dumps([{"name":"zdzdazd","value":"asdasdsd","secret":False,"parameter_type":"0195fbd5-5a25-7278-9dd8-6b5dea203f40"}])

        }
        #multipart_data = list(data.items()) + images
        
        
        print(f"Sending data: {data}")
        
        response = api_client().post(
            self.endpoint,
            data=data,
            format="multipart",  # Utiliser multipart/form-data pour les fichiers
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content: {response.content}")
        
        # Assertions
        assert response.status_code == 201
        assert response.data["name"] == "Component"
        assert response.data["description"] == "description"
        assert response.data["availability"] == False
        assert response.data["confidentiality"] == False
        assert response.data["integrity"] == True
        assert response.data["notes"] == ""
        assert len(response.data["images"]) == 1
        assert response.data["parameters"] is not None
        


        
    
    def test_update(self, component_factory, api_client):
        component = component_factory()
        
        data = {
            "name": "updated Component",
            "description": "updated description",
            "availability": "False",  
            "confidentiality": "True", 
            "integrity": "True",
            "version": str(component.version.uuid), 
            "notes": "updated notes",
            "images": "[]",
        }
        
        print(f"Sending update data: {data}")
        
        response = api_client().put(
            f"{self.endpoint}{component.id}/",
            data,
            format="multipart",  # Utiliser multipart/form-data pour les fichiers
        )
        
        print(f"Status: {response.status_code}")
        print(f"Content: {response.content}")
        
        # Assertions
        assert response.status_code == 200
        assert response.data["name"] == "updated Component"
        assert response.data["description"] == "updated description"
        assert response.data["availability"] == False
        assert response.data["confidentiality"] == True
        assert response.data["integrity"] == True
        assert response.data["notes"] == "updated notes"
        assert response.data["images"] == []
    
    def test_destroy(self, component_factory, api_client):
        component = component_factory()
        response = api_client().delete(f"{self.endpoint}{component.id}/")
        assert response.status_code == 204