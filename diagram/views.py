from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets
from .models import *
from .serializers import *
from rest_framework.response import Response
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
import json
import uuid6 as uuid
import os
import shutil
from django.conf import settings


def get_parameter_detail(request, parameter_id):
    # Récupère le Parameter choisi
    parameter = get_object_or_404(Parameter, pk=parameter_id)
    # Récupère les Get_parameter associés (s'il y en a plusieurs, vous pouvez choisir le premier ou les afficher tous)
    get_parameters = parameter.get_parameters.all()
    context = {
        "parameter": parameter,
        "get_parameters": get_parameters,
    }
    return render(request, "parameter_detail.html", context)

class ComponentView(viewsets.ViewSet):
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    parser_classes = (MultiPartParser, FormParser,JSONParser)

    def list(self, request):
        queryset = Component.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk):
        try:
            item = Component.objects.select_related("version", "version__sut").prefetch_related("flowexecutions", "vulnerabilities", "parameters", "images").get(pk=pk)
            serializer = ComponentGETSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Component.DoesNotExist:
            return Response({"message": "The object does not exist"},
                            status=status.HTTP_404_NOT_FOUND)
    
    def retrieve_diagram(self, request, pk):
        try:
            item = Component.objects.prefetch_related("images", "parameters").get(pk=pk)
            serializer = DiagramComponentSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Component.DoesNotExist:
            return Response({"message": "The object does not exist"},
                            status=status.HTTP_404_NOT_FOUND)

    @swagger_auto_schema(request_body=ComponentSerializer)
    def create(self, request):
        files = request.FILES.getlist("files") 
        data = request.data
    
        component_data = {
            "name": data.get("name", "").strip('"'),
            "description": data.get("description", "").strip('"'),
            "version": data.get("version", "").strip('"'),
            "notes": data.get("notes", "").strip('"'),
        }
        component_data["availability"] = data.get("availability", "").strip('"')
        component_data["integrity"] = data.get("integrity", "").strip('"') 
        component_data["confidentiality"] = data.get("confidentiality", "").strip('"') 
                # Process parameters if they exist
        parameters = []
        if "parameters" in data:
            try:
                # Try to parse parameters as JSON if it's a string
                if isinstance(data["parameters"], str):
                    parameters = json.loads(data["parameters"])
                else:
                    parameters = data["parameters"]
                print("Received parameters:", parameters)
            except json.JSONDecodeError as e:
                print(f"Error parsing parameters: {e}")
                return Response({"message": f"Invalid parameters format: {e}"}, status=400)
    
        component = self.serializer_class(data=component_data)
        component_instance = None
        if component.is_valid():
            component_instance = component.save()
        else:
            return Response(component.errors, status=400)
    
        pk = component_instance.id
    
        # Handle parameters
        if parameters:
            for param in parameters:
                try:
                    parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                    Parameter.objects.create(
                        component=component_instance,
                        name=param.get('name', ''),
                        value=param.get('value', ''),
                        secret=param.get('secret', False),
                        parameter_type=parameter_type
                    )
                except Exception as e:
                    print(f"Error creating parameter: {e}")
                    # Continue even if parameter creation fails
    
        # Handle images
        path = f"images/component/{pk}/"
        ImageFile.file.field.upload_to = path
    
        component_images = []
        for img, file in zip(json.loads(data["images"]), files):
            image = img.copy()
            image["file"] = file
            try:
                imgSerializer = ImageFileSerializer(data=image)
    
                if imgSerializer.is_valid():
                    image_instance = imgSerializer.save(uuid=uuid.uuid7())
                    component_images.append(image_instance)
    
                else:
                    return Response(imgSerializer.errors, status=500)
            except Exception as e:
                return Response({"message": e.__str__()}, status=500)
    
        component_instance.images.set(component_images)
        serializer = DiagramComponentSerializer(component_instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @swagger_auto_schema(request_body=ComponentSerializer)
    def update(self, request, pk):
        try:
            data = request.data
            files = request.FILES.getlist("files")
    
            component = Component.objects.get(pk=pk)

            onlyNotes = data.get("onlyNotes", None)
            if onlyNotes == "1":
                component.notes = data["notes"]
                component.save(update_fields=["notes"])
            else:
                component_data = {
                    "name": data.get("name", "").strip('"'),
                    "description": data.get("description", "").strip('"'),
                    "version": data.get("version", "").strip('"'),
                    "notes": data.get("notes", "").strip('"'),
                }
                component_data["availability"] = data.get("availability", "").strip('"')
                component_data["integrity"] = data.get("integrity", "").strip('"')
                component_data["confidentiality"] = data.get("confidentiality", "").strip('"') 
        
                # Process parameters if they exist
                parameters = []
                if "parameters" in data:
                    try:
                        # Try to parse parameters as JSON if it's a string
                        if isinstance(data["parameters"], str):
                            parameters = json.loads(data["parameters"])
                        else:
                            parameters = data["parameters"]
                        print("Received parameters for update:", parameters)
                    except json.JSONDecodeError as e:
                        print(f"Error parsing parameters: {e}")
                        return Response({"message": f"Invalid parameters format: {e}"}, status=400)
        
                # Handle images
                path = f"images/component/{pk}/"
                ImageFile.file.field.upload_to = path
                
                component_images = []
                current_images = [img.uuid for img in component.images.all()]
                inc = 0
                for img in json.loads(data["images"]):
                    image = img.copy()
                    if image["uuid"] == "":
                        file = files[inc]
                        image["file"] = file
                        imgSerializer = ImageFileSerializer(data=image)
        
                        if imgSerializer.is_valid():
                            image_instance = imgSerializer.save(uuid=uuid.uuid7())
                            component_images.append(image_instance)
                        else:
                            return Response(imgSerializer.errors, status=500)
                        inc += 1
                    else:
                        try:
                            img_update = ImageFile.objects.get(pk=image["uuid"])
                            try:
                                img_update.default = image["default"]
                                img_update.save(update_fields=["default"])
                            except Exception as e:
                                return Response({"message": e.__str__()}, status=500)
                            component_images.append(img_update)
                        except ImageFile.DoesNotExist as e:
                            return Response(
                                {"message": e.__str__()},
                                status=status.HTTP_404_NOT_FOUND,
                            )
        
                for item in [
                    img
                    for img in current_images
                    if img not in [img.uuid for img in component_images]
                ]:
                    img = ImageFile.objects.get(pk=item)
                    full_path = img.file.path
                    if os.path.exists(full_path):
                        os.remove(full_path)  # Delete from filesystem
                        
                    img.delete()
        
                try:
                    # Update component fields
                    component.images.set(component_images)
                    component.name = component_data["name"]
                    component.description = component_data["description"]
                    component.availability = component_data["availability"]
                    component.integrity = component_data["integrity"]
                    component.confidentiality = component_data["confidentiality"]
                    if component_data["version"]:
                        version_instance = Version.objects.get(pk=component_data["version"])
                        component.version = version_instance
                    component.notes = component_data["notes"]
                    component.save()

                    # First, delete existing parameters (need to be improve)
                    Parameter.objects.filter(component=component).delete()
        
                    # Update parameters
                    if parameters:
                        # Then create new ones
                        for param in parameters:
                            try:
                                parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                                Parameter.objects.create(
                                    component=component,
                                    name=param.get('name', ''),
                                    value=param.get('value', ''),
                                    secret=param.get('secret', False),
                                    parameter_type=parameter_type
                                )
                            except Exception as e:
                                print(f"Error updating parameter: {e}")
                                # Continue even if parameter update fails
                                
                except Exception as e:
                    return Response({"message": e.__str__()}, status=500)
    
            serializer = DiagramComponentSerializer(component)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"message": e.__str__()}, status=400)

    def destroy(self, request, pk):
        try:
            component = Component.objects.get(pk=pk)
            
            # Get all images associated with this component
            images = component.images.all()
            
            # Delete file paths first
            for img in images:
                try:
                    if img.file and os.path.exists(img.file.path):
                        os.remove(img.file.path)
                except (FileNotFoundError, OSError) as e:
                    # Log the error but continue with deletion
                    print(f"Could not delete image file: {e}")
                    # Continue with component deletion even if file removal fails
            
            # Now delete the component (will cascade delete the images too)
            component.delete()
            
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Component.DoesNotExist:
            return Response(
                {"detail": "Component not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SubComponentView(viewsets.ViewSet):
    """
    A viewset for handling CRUD operations on SubComponent objects.

    - GET: Retrieves a list of all SubComponent objects.
    - GET (with pk): Retrieves a single SubComponent object by its primary key.
    - POST: Creates a new SubComponent object.
    - PUT: Updates an existing SubComponent object by its primary key.
    - DELETE: Deletes a SubComponent object by its primary key.
    """
    queryset = SubComponent.objects.all()
    serializer_class = SubComponentSerializer
    parser_classes = (MultiPartParser, FormParser)

    def list(self, request):
        queryset = SubComponent.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk):
        try:
            item = SubComponent.objects.select_related("version", "version__sut").prefetch_related("flowexecutions", "vulnerabilities", "parameters", "images").get(pk=pk)
            serializer = SubComponentGETSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except SubComponent.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )
    
    def retrieve_diagram(self, request, pk):
        try:
            item = SubComponent.objects.prefetch_related("images", "parameters").get(pk=pk)
            serializer = DiagramSubComponentSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except SubComponent.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @swagger_auto_schema(request_body=SubComponentSerializer)
    def create(self, request):
        files = request.FILES.getlist("files") 
        data = request.data
    
        # Create subcomponent_data with safe access to optional fields
        subcomponent_data = {
            "name": data.get("name", "").strip('"'),
            "description": data.get("description", "").strip('"'),
            "availability": data.get("availability", "").strip('"'),
            "integrity": data.get("integrity", "").strip('"'),
            "confidentiality": data.get("confidentiality", "").strip('"'),
            "notes": data.get("notes", "").strip('"'),
            "component": data.get("component", "").strip('"'),
        }

        parameters = []
        if "parameters" in data:
            try:
                # Try to parse parameters as JSON if it's a string
                if isinstance(data["parameters"], str):
                    parameters = json.loads(data["parameters"])
                else:
                    parameters = data["parameters"]
                print("Received parameters:", parameters)
            except json.JSONDecodeError as e:
                print(f"Error parsing parameters: {e}")
                return Response({"message": f"Invalid parameters format: {e}"}, status=400)
    
        # Récupérer la version du composant parent et l'utiliser pour le sous-composant
        try:
            parent_component = Component.objects.get(pk=subcomponent_data["component"])
            subcomponent_data["version"] = parent_component.version.pk if parent_component.version else None
        except Component.DoesNotExist:
            return Response({"message": "Parent component not found"}, status=404)
        except Exception as e:
            return Response({"message": str(e)}, status=400)
    
        print("Subcomponent data:", subcomponent_data)

    
        subcomponent = self.serializer_class(data=subcomponent_data)
        if not subcomponent.is_valid():
            print("Validation errors:", subcomponent.errors)
            return Response(subcomponent.errors, status=400)
    
        subcomponent_instance = subcomponent.save()
        
                # Handle parameters
        if parameters:
            for param in parameters:
                try:
                    parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                    Parameter.objects.create(
                        subcomponent=subcomponent_instance,
                        name=param.get('name', ''),
                        value=param.get('value', ''),
                        secret=param.get('secret', False),
                        parameter_type=parameter_type
                    )
                except Exception as e:
                    print(f"Error creating parameter: {e}")
                    # Continue even if parameter creation fails
        # Handle images if any
        if files:
            pk = subcomponent_instance.id
            path = f"images/subcomponent/{pk}/"
            ImageFile.file.field.upload_to = path
    
            subcomponent_images = []
            images_data = json.loads(data.get("images", "[]"))
            
            for img, file in zip(images_data, files):
                image = img.copy()
                image["file"] = file
                try:
                    imgSerializer = ImageFileSerializer(data=image)
                    if imgSerializer.is_valid():
                        image_instance = imgSerializer.save(uuid=uuid.uuid7())
                        subcomponent_images.append(image_instance)
                    else:
                        return Response(imgSerializer.errors, status=500)
                except Exception as e:
                    return Response({"message": str(e)}, status=500)
    
            subcomponent_instance.images.set(subcomponent_images)
    
        serializer = DiagramSubComponentSerializer(subcomponent_instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    

    @swagger_auto_schema(request_body=SubComponentSerializer)
    def update(self, request, pk):
        try:
            data = request.data
            files = request.FILES.getlist("files")

            subcomponent = SubComponent.objects.get(pk=pk)

            onlyNotes = data.get("onlyNotes", None)
            if onlyNotes == "1":
                subcomponent.notes = data["notes"]
                subcomponent.save(update_fields=["notes"])
            else:
                subcomponent_data = {
                    "name": data["name"].strip('"'),
                    "description": data["description"].strip('"'),
                    "availability": data["availability"].strip('"'),
                    "integrity": data["integrity"].strip('"'),
                    "confidentiality": data["confidentiality"].strip('"'),
                    "notes": data["notes"].strip('"'),
                    "component": data["component"].strip('"'),
                }

                            # Process parameters if they exist
                parameters = []
                if "parameters" in data:
                    try:
                        # Try to parse parameters as JSON if it's a string
                        if isinstance(data["parameters"], str):
                            parameters = json.loads(data["parameters"])
                        else:
                            parameters = data["parameters"]
                        print("Received parameters for update:", parameters)
                    except json.JSONDecodeError as e:
                        print(f"Error parsing parameters: {e}")
                        return Response({"message": f"Invalid parameters format: {e}"}, status=400)

                # Récupérer la version du composant parent
                try:
                    parent_component = Component.objects.get(pk=subcomponent_data["component"])
                    subcomponent_data["version"] = parent_component.version.pk if parent_component.version else None
                except Component.DoesNotExist:
                    return Response({"message": "Parent component not found"}, status=404)
                except Exception as e:
                    return Response({"message": str(e)}, status=400)

                path = f"images/subcomponent/{pk}/"
                ImageFile.file.field.upload_to = path
                # if not os.path.exists(path):
                #     os.makedirs(path)
                subcomponent_images = []
                current_images = [img.uuid for img in subcomponent.images.all()]
                inc = 0
                for img in json.loads(data["images"]):
                    image = img.copy()
                    if image["uuid"] == "":
                        file = files[inc]
                        image["file"] = file
                        imgSerializer = ImageFileSerializer(data=image)

                        if imgSerializer.is_valid():
                            image_instance = imgSerializer.save(uuid=uuid.uuid7())
                            subcomponent_images.append(image_instance)
                        else:
                            return Response(imgSerializer.errors, status=500)
                        inc += 1
                    else:
                        try:
                            img_update = ImageFile.objects.get(pk=image["uuid"])
                            try:
                                img_update.default = image["default"]
                                img_update.save(update_fields=["default"])
                            except Exception as e:
                                return Response({"message": e.__str__()}, status=500)
                            subcomponent_images.append(img_update)
                        except ImageFile.DoesNotExist as e:
                            return Response(
                                {"message": e.__str__()},
                                status=status.HTTP_404_NOT_FOUND,
                            )

                for item in [
                    img
                    for img in current_images
                    if img not in [img.uuid for img in subcomponent_images]
                ]:
                    img = ImageFile.objects.get(pk=item)
                    full_path = img.file.path
                    if os.path.exists(full_path):
                        os.remove(full_path)  # Delete from filesystem
                        

                    img.delete()

                try:
                    subcomponent.images.set(subcomponent_images)
                    subcomponent.name = subcomponent_data["name"]
                    subcomponent.description = subcomponent_data["description"]
                    subcomponent.availability = subcomponent_data["availability"]
                    subcomponent.integrity = subcomponent_data["integrity"]
                    subcomponent.confidentiality = subcomponent_data["confidentiality"]
                    # Use version from parent component
                    if subcomponent_data["version"]:
                        version_instance = Version.objects.get(pk=subcomponent_data["version"])
                        subcomponent.version = version_instance
                    subcomponent.notes = subcomponent_data["notes"]
                    subcomponent.component_id = subcomponent_data["component"]
                    subcomponent.save()


                    # Update parameters
                    # First, delete existing parameters (need to be improved)
                    Parameter.objects.filter(subcomponent=subcomponent).delete()
                    if parameters:
                        # Then create new ones
                        for param in parameters:
                            try:
                                parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                                Parameter.objects.create(
                                    subcomponent=subcomponent,
                                    name=param.get('name', ''),
                                    value=param.get('value', ''),
                                    secret=param.get('secret', False),
                                    parameter_type=parameter_type
                                )
                            except Exception as e:
                                print(f"Error updating parameter: {e}")
                                # Continue even if parameter update fails
                except Exception as e:
                    return Response({"message": e.__str__()}, status=500)

            serializer = DiagramSubComponentSerializer(subcomponent)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"message": e.__str__()}, status=400)

    def destroy(self, request, pk):
        try:
            subcomponent = SubComponent.objects.get(pk=pk)
            
            # Get all images associated with this component
            images = subcomponent.images.all()
            
            # Delete file paths first
            for img in images:
                try:
                    if img.file and os.path.exists(img.file.path):
                        os.remove(img.file.path)
                except (FileNotFoundError, OSError) as e:
                    # Log the error but continue with deletion
                    print(f"Could not delete image file: {e}")
                    # Continue with component deletion even if file removal fails
            
            # Now delete the component (will cascade delete the images too)
            subcomponent.delete()
            
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Component.DoesNotExist:
            return Response(
                {"detail": "subcomponent not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class PortView(viewsets.ViewSet):
    """
    A viewset for handling CRUD operations on Port objects.

    - GET: Retrieves a list of all Port objects.
    - GET (with pk): Retrieves a single Port object by its primary key.
    - POST: Creates a new Port object.
    - PUT: Updates an existing Port object by its primary key.
    - DELETE: Deletes a Port object by its primary key.
    """
    queryset = Port.objects.all()
    serializer_class = PortSerializer
    parser_classes = (MultiPartParser, FormParser)

    def list(self, request):
        queryset = Port.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk):
        try:
            item = Port.objects.select_related("version", "version__sut").prefetch_related("flowexecutions", "vulnerabilities", "parameters", "images").get(pk=pk)
            serializer = PortGETSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Port.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    def retrieve_diagram(self, request, pk):
        try:
            item = Port.objects.prefetch_related("parameters", "images").get(pk=pk)
            serializer = DiagramPortSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Port.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @swagger_auto_schema(request_body=PortSerializer)
    def create(self, request):
        files = request.FILES.getlist("files") 
        data = request.data
    
        # Create port_data with safe access to optional fields
        port_data = {
            "name": data.get("name", "").strip('"'),
            "description": data.get("description", "").strip('"'),
            "availability": data.get("availability", "").strip('"'),
            "integrity": data.get("integrity", "").strip('"'),
            "confidentiality": data.get("confidentiality", "").strip('"'),
            "notes": data.get("notes", "").strip('"'),
            "component": data.get("component", "").strip('"'),
        }

        parameters = []
        if "parameters" in data:
            try:
                # Try to parse parameters as JSON if it's a string
                if isinstance(data["parameters"], str):
                    parameters = json.loads(data["parameters"])
                else:
                    parameters = data["parameters"]
                print("Received parameters:", parameters)
            except json.JSONDecodeError as e:
                print(f"Error parsing parameters: {e}")
                return Response({"message": f"Invalid parameters format: {e}"}, status=400)
    
        # Récupérer la version du composant parent et l'utiliser pour le sous-composant
        try:
            parent_component = Component.objects.get(pk=port_data["component"])
            port_data["version"] = parent_component.version.pk if parent_component.version else None
        except Component.DoesNotExist:
            return Response({"message": "Parent component not found"}, status=404)
        except Exception as e:
            return Response({"message": str(e)}, status=400)
    
        print("port data:", port_data)

    
        port = self.serializer_class(data=port_data)
        if not port.is_valid():
            print("Validation errors:", port.errors)
            return Response(port.errors, status=400)
    
        port_instance = port.save()

        # Handle parameters
        if parameters:
            for param in parameters:
                try:
                    parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                    Parameter.objects.create(
                        port=port_instance,
                        name=param.get('name', ''),
                        value=param.get('value', ''),
                        secret=param.get('secret', False),
                        parameter_type=parameter_type
                    )
                except Exception as e:
                    print(f"Error creating parameter: {e}")
                    # Continue even if parameter creation fails
        
        # Handle images if any
        if files:
            pk = port_instance.id
            path = f"images/port/{pk}/"
            ImageFile.file.field.upload_to = path
    
            port_images = []
            images_data = json.loads(data.get("images", "[]"))
            
            for img, file in zip(images_data, files):
                image = img.copy()
                image["file"] = file
                try:
                    imgSerializer = ImageFileSerializer(data=image)
                    if imgSerializer.is_valid():
                        image_instance = imgSerializer.save(uuid=uuid.uuid7())
                        port_images.append(image_instance)
                    else:
                        return Response(imgSerializer.errors, status=500)
                except Exception as e:
                    return Response({"message": str(e)}, status=500)
    
            port_instance.images.set(port_images)
    
        serializer = DiagramPortSerializer(port_instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @swagger_auto_schema(request_body=PortSerializer)
    def update(self, request, pk):
        try:
            data = request.data
            files = request.FILES.getlist("files")
            port = Port.objects.get(pk=pk)

            onlyNotes = data.get("onlyNotes", None)
            if onlyNotes == "1":
                port.notes = data["notes"]
                port.save(update_fields=["notes"])
            else:
                port_data = {
                    "name": data["name"].strip('"'),
                    "description": data["description"].strip('"'),
                    "availability": data["availability"].strip('"'),
                    "integrity": data["integrity"].strip('"'),
                    "confidentiality": data["confidentiality"].strip('"'),
                    "notes": data["notes"].strip('"'),
                    "component": data["component"].strip('"'),
                }


                # Process parameters if they exist
                parameters = []
                if "parameters" in data:
                    try:
                        # Try to parse parameters as JSON if it's a string
                        if isinstance(data["parameters"], str):
                            parameters = json.loads(data["parameters"])
                        else:
                            parameters = data["parameters"]
                        print("Received parameters for update:", parameters)
                    except json.JSONDecodeError as e:
                        print(f"Error parsing parameters: {e}")
                        return Response({"message": f"Invalid parameters format: {e}"}, status=400)

                # Récupérer la version du composant parent
                try:
                    parent_component = Component.objects.get(pk=port_data["component"])
                    port_data["version"] = parent_component.version.pk if parent_component.version else None
                except Component.DoesNotExist:
                    return Response({"message": "Parent component not found"}, status=404)
                except Exception as e:
                    return Response({"message": str(e)}, status=400)

                path = f"images/port/{pk}/"
                ImageFile.file.field.upload_to = path
                # if not os.path.exists(path):
                #     os.makedirs(path)
                port_images = []
                current_images = [img.uuid for img in port.images.all()]
                inc = 0
                for img in json.loads(data["images"]):
                    image = img.copy()
                    if image["uuid"] == "":
                        file = files[inc]
                        image["file"] = file
                        imgSerializer = ImageFileSerializer(data=image)

                        if imgSerializer.is_valid():
                            image_instance = imgSerializer.save(uuid=uuid.uuid7())
                            port_images.append(image_instance)
                        else:
                            return Response(imgSerializer.errors, status=500)
                        inc += 1
                    else:
                        try:
                            img_update = ImageFile.objects.get(pk=image["uuid"])
                            try:
                                img_update.default = image["default"]
                                img_update.save(update_fields=["default"])
                            except Exception as e:
                                return Response({"message": e.__str__()}, status=500)
                            port_images.append(img_update)
                        except ImageFile.DoesNotExist as e:
                            return Response(
                                {"message": e.__str__()},
                                status=status.HTTP_404_NOT_FOUND,
                            )

                for item in [
                    img
                    for img in current_images
                    if img not in [img.uuid for img in port_images]
                ]:
                    img = ImageFile.objects.get(pk=item)
                    full_path = img.file.path
                    if os.path.exists(full_path):
                        os.remove(full_path)  # Delete from filesystem
                        

                    img.delete()

                try:
                    port.images.set(port_images)
                    port.name = port_data["name"]
                    port.description = port_data["description"]
                    port.availability = port_data["availability"]
                    port.integrity = port_data["integrity"]
                    port.confidentiality = port_data["confidentiality"]
                    # Use version from parent component
                    if port_data["version"]:
                        version_instance = Version.objects.get(pk=port_data["version"])
                        port.version = version_instance
                    port.notes = port_data["notes"]
                    port.component_id = port_data["component"]
                    port.save()

                    # Update parameters
                    # First, delete existing parameters (need to be improve)
                    Parameter.objects.filter(port=port).delete()
                    if parameters:
                        
                        # Then create new ones
                        for param in parameters:
                            try:
                                parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                                Parameter.objects.create(
                                    port=port,
                                    name=param.get('name', ''),
                                    value=param.get('value', ''),
                                    secret=param.get('secret', False),
                                    parameter_type=parameter_type
                                )
                            except Exception as e:
                                print(f"Error updating parameter: {e}")
                                # Continue even if parameter update fails


                except Exception as e:
                    return Response({"message": e.__str__()}, status=500)

            serializer = DiagramPortSerializer(port)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"message": e.__str__()}, status=400)

    def destroy(self, request, pk):
        try:
            port = Port.objects.get(pk=pk)
            
            # Get all images associated with this component
            images = port.images.all()
            
            # Delete file paths first
            for img in images:
                try:
                    if img.file and os.path.exists(img.file.path):
                        os.remove(img.file.path)
                except (FileNotFoundError, OSError) as e:
                    # Log the error but continue with deletion
                    print(f"Could not delete image file: {e}")
                    # Continue with component deletion even if file removal fails
            
            # Now delete the component (will cascade delete the images too)
            port.delete()
            
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Component.DoesNotExist:
            return Response(
                {"detail": "port not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class InterfaceView(viewsets.ViewSet):
    """
    A viewset for handling CRUD operations on Interface objects.

    - GET: Retrieves a list of all Interface objects.
    - GET (with pk): Retrieves a single Interface object by its primary key.
    - POST: Creates a new Interface object.
    - PUT: Updates an existing Interface object by its primary key.
    - DELETE: Deletes a Interface object by its primary key.
    """
    queryset = Interface.objects.all()
    serializer_class = InterfaceSerializer

    def list(self, request):
        queryset = Interface.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk):
        try:
            item = Interface.objects.select_related("version", "version__sut", "port_from", "port_to_port", "port_to_subcomponent").prefetch_related("parameters", "images").get(pk=pk)
            serializer = self.serializer_class(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Interface.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    def retrieve_diagram(self, request, pk):
        try:
            item = Interface.objects.prefetch_related("parameters", "images").get(pk=pk)
            serializer = DiagramInterfaceSerializer(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Interface.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @swagger_auto_schema(request_body=InterfaceSerializer)
    def create(self, request):
        files = request.FILES.getlist("files") 
        data = request.data
    
        # Create interface_data with safe access to optional fields
        interface_data = {
            "name": data.get("name", "").strip('"'),
            "description": data.get("description", "").strip('"'),
            "availability": data.get("availability", "").strip('"'),
            "integrity": data.get("integrity", "").strip('"'),
            "confidentiality": data.get("confidentiality", "").strip('"'),
            "notes": data.get("notes", "").strip('"'),
            "port_from": data.get("port_from"),  # Ne pas faire de strip() sur les UUIDs
            "type": data.get("type", "external")
        }
    
        # Process parameters if they exist
        parameters = []
        if "parameters" in data:
            try:
                # Try to parse parameters as JSON if it's a string
                if isinstance(data["parameters"], str):
                    parameters = json.loads(data["parameters"])
                else:
                    parameters = data["parameters"]
                print("Received parameters:", parameters)
            except json.JSONDecodeError as e:
                print(f"Error parsing parameters: {e}")
                return Response({"message": f"Invalid parameters format: {e}"}, status=400)
    
        port_to_port = data.get("port_to_port")
        port_to_subcomponent = data.get("port_to_subcomponent")
    
        if port_to_port and port_to_port != '""':
            interface_data["port_to_port"] = port_to_port
        if port_to_subcomponent and port_to_subcomponent != '""':
            interface_data["port_to_subcomponent"] = port_to_subcomponent
    
        try:
            source_port = Port.objects.get(pk=interface_data["port_from"])
            interface_data["version"] = source_port.version.pk if source_port.version else None
            interface_data["component"] = source_port.component.pk if source_port.component else None
        except Port.DoesNotExist:
            return Response({"message": "Source port not found"}, status=404)
        except Exception as e:
            return Response({"message": str(e)}, status=400)
    
        print("Interface data:", interface_data)
    
        interface = self.serializer_class(data=interface_data)
        if not interface.is_valid():
            print("Validation errors:", interface.errors)
            return Response(interface.errors, status=400)
    
        interface_instance = interface.save()
    
        # Handle parameters
        if parameters:
            for param in parameters:
                try:
                    parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                    Parameter.objects.create(
                        interface=interface_instance,
                        name=param.get('name', ''),
                        value=param.get('value', ''),
                        secret=param.get('secret', False),
                        parameter_type=parameter_type
                    )
                except Exception as e:
                    print(f"Error creating parameter: {e}")
                    # Continue even if parameter creation fails
    
        # Handle images if files exist
        if files:
            pk = interface_instance.id
            path = f"images/interface/{pk}/"
            ImageFile.file.field.upload_to = path
    
            interface_images = []
            images_data = json.loads(data.get("images", "[]"))
            
            for img, file in zip(images_data, files):
                image = img.copy()
                image["file"] = file
                try:
                    imgSerializer = ImageFileSerializer(data=image)
                    if imgSerializer.is_valid():
                        image_instance = imgSerializer.save(uuid=uuid.uuid7())
                        interface_images.append(image_instance)
                    else:
                        return Response(imgSerializer.errors, status=500)
                except Exception as e:
                    return Response({"message": str(e)}, status=500)
    
            interface_instance.images.set(interface_images)
    
        serializer = DiagramInterfaceSerializer(interface_instance)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
      

    @swagger_auto_schema(request_body=InterfaceSerializer)
    def update(self, request, pk):
        try:
            data = request.data
            files = request.FILES.getlist("files")
    
            interface = Interface.objects.get(pk=pk)
    
            # Get the actual Port instance for port_from
            try:
                port_from = Port.objects.get(pk=data["port_from"].strip('"'))
            except Port.DoesNotExist:
                return Response({"message": "Source port not found"}, status=404)
    
            interface_data = {
                "name": data["name"].strip('"'),
                "description": data["description"].strip('"'),
                "availability": data["availability"].strip('"'),
                "integrity": data["integrity"].strip('"'),
                "confidentiality": data["confidentiality"].strip('"'),
                "notes": data["notes"].strip('"'),
                "port_from": port_from,  # Use the actual Port instance
                "type": data.get("type", "external"),
            }


                                    # Process parameters if they exist
            parameters = []
            if "parameters" in data:
                try:
                    # Try to parse parameters as JSON if it's a string
                    if isinstance(data["parameters"], str):
                        parameters = json.loads(data["parameters"])
                    else:
                        parameters = data["parameters"]
                    print("Received parameters for update:", parameters)
                except json.JSONDecodeError as e:
                    print(f"Error parsing parameters: {e}")
                    return Response({"message": f"Invalid parameters format: {e}"}, status=400)
    
            # Handle optional fields
            port_to_port = data.get("port_to_port")
            port_to_subcomponent = data.get("port_to_subcomponent")
    
            if port_to_port and port_to_port != '""':
                try:
                    port_to = Port.objects.get(pk=port_to_port.strip('"'))
                    interface_data["port_to_port"] = port_to
                except Port.DoesNotExist:
                    return Response({"message": "Target port not found"}, status=404)
    
            if port_to_subcomponent and port_to_subcomponent != '""':
                try:
                    subcomp_to = SubComponent.objects.get(pk=port_to_subcomponent.strip('"'))
                    interface_data["port_to_subcomponent"] = subcomp_to
                except SubComponent.DoesNotExist:
                    return Response({"message": "Target subcomponent not found"}, status=404)
    
            # Get version and component from source port
            interface_data["version"] = port_from.version
            interface_data["component"] = port_from.component
    
            # Handle images
            path = f"images/interface/{pk}/"
            ImageFile.file.field.upload_to = path
            
            interface_images = []
            if "images" in data:
                current_images = [img.uuid for img in interface.images.all()]
                inc = 0
                for img in json.loads(data["images"]):
                    image = img.copy()
                    if image["uuid"] == "":
                        file = files[inc]
                        image["file"] = file
                        imgSerializer = ImageFileSerializer(data=image)
    
                        if imgSerializer.is_valid():
                            image_instance = imgSerializer.save(uuid=uuid.uuid7())
                            interface_images.append(image_instance)
                        else:
                            return Response(imgSerializer.errors, status=500)
                        inc += 1
                    else:
                        try:
                            img_update = ImageFile.objects.get(pk=image["uuid"])
                            img_update.default = image["default"]
                            img_update.save(update_fields=["default"])
                            interface_images.append(img_update)
                        except ImageFile.DoesNotExist:
                            return Response(
                                {"message": f"Image with uuid {image['uuid']} not found"},
                                status=status.HTTP_404_NOT_FOUND,
                            )
    
                # Delete removed images
                for item in [img for img in current_images if img not in [img.uuid for img in interface_images]]:
                    img = ImageFile.objects.get(pk=item)
                    if os.path.exists(img.file.path):
                        os.remove(img.file.path)
                    img.delete()
    
            # Update interface
            try:
                if interface_images:
                    interface.images.set(interface_images)
                
                for key, value in interface_data.items():
                    setattr(interface, key, value)
                
                interface.save()

                # First, delete existing parameters (need to be improve)
                Parameter.objects.filter(interface=interface).delete()
                if parameters:
                    # Then create new ones
                    for param in parameters:
                        try:
                            parameter_type = ParameterType.objects.get(id=param.get('parameter_type'))
                            Parameter.objects.create(
                                interface=interface,
                                name=param.get('name', ''),
                                value=param.get('value', ''),
                                secret=param.get('secret', False),
                                parameter_type=parameter_type
                            )
                        except Exception as e:
                            print(f"Error updating parameter: {e}")
                            # Continue even if parameter update fails
            except Exception as e:
                return Response({"message": e.__str__()}, status=500)
                
            serializer = DiagramInterfaceSerializer(interface)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except Exception as e:
                return Response({"message": str(e)}, status=500)
    
        except Exception as e:
            return Response({"message": str(e)}, status=400)

    def destroy(self, request, pk):
        try:
            interface = Interface.objects.get(pk=pk)
            
            # Get all images associated with this component
            images = interface.images.all()
            
            # Delete file paths first
            for img in images:
                try:
                    if img.file and os.path.exists(img.file.path):
                        os.remove(img.file.path)
                except (FileNotFoundError, OSError) as e:
                    # Log the error but continue with deletion
                    print(f"Could not delete image file: {e}")
                    # Continue with component deletion even if file removal fails
            
            # Now delete the component (will cascade delete the images too)
            interface.delete()
            
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Component.DoesNotExist:
            return Response(
                {"detail": "interface not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {"message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ParameterView(viewsets.ModelViewSet):
    """
    A viewset for handling CRUD operations on Parameter objects.

    - GET: Retrieves a list of all Parameter objects.
    - GET (with pk): Retrieves a single Parameter object by its primary key.
    - POST: Creates a new Parameter object.
    - PUT: Updates an existing Parameter object by its primary key.
    - DELETE: Deletes a Parameter object by its primary key.
    """
    queryset = Parameter.objects.all()
    serializer_class = ParameterSerializer

    def list(self, request):
        queryset = Parameter.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk):
        try:
            item = Parameter.objects.get(pk=pk)
            serializer = self.serializer_class(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Parameter.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @swagger_auto_schema(request_body=ParameterSerializer)
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @swagger_auto_schema(request_body=ParameterSerializer)
    def update(self, request, pk):
        try:
            item = Parameter.objects.get(pk=pk)
        except Parameter.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.serializer_class(item, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, pk):
        try:
            item = Parameter.objects.get(pk=pk)
            item.delete()
            return Response(
                {"message": "The object has been deleted"},
                status=status.HTTP_204_NO_CONTENT,
            )
        except Parameter.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=['get'], url_path='complete')
    def get_complete_parameters(self, request):
        """Récupère tous les paramètres avec leurs relations complètes"""
        parameters = self.get_queryset()
        serializer = CompleteParameterSerializer(parameters, many=True)
        return Response(serializer.data)

    def get_queryset(self):
        queryset = super().get_queryset()
        # Cherche si l'URL contient un paramètre de version
        version_id = self.request.query_params.get('version', None)
        
        if version_id:
            # Filtrer les paramètres par version
            # Si
            queryset = queryset.filter(
                models.Q(component__version__uuid=version_id) | 
                models.Q(subcomponent__version__uuid=version_id) | 
                models.Q(port__version__uuid=version_id) | 
                models.Q(interface__version__uuid=version_id)
            )
            
        return queryset

class ParameterTypeView(viewsets.ModelViewSet):
    """
    A viewset for handling CRUD operations on ParameterType objects.

    - GET: Retrieves a list of all ParameterType objects.
    - GET (with pk): Retrieves a single ParameterType object by its primary key.
    - POST: Creates a new ParameterType object.
    - PUT: Updates an existing ParameterType object by its primary key.
    - DELETE: Deletes a ParameterType object by its primary key.
    """
    queryset = ParameterType.objects.all()
    serializer_class = ParameterTypeSerializer

    def list(self, request):
        queryset = ParameterType.objects.all()
        serializer = self.serializer_class(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk):
        try:
            item = ParameterType.objects.get(pk=pk)
            serializer = self.serializer_class(item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ParameterType.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @swagger_auto_schema(request_body=ParameterTypeSerializer)
    def create(self, request):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @swagger_auto_schema(request_body=ParameterTypeSerializer)
    def update(self, request, pk):
        try:
            item = ParameterType.objects.get(pk=pk)
        except ParameterType.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.serializer_class(item, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, pk):
        try:
            item = ParameterType.objects.get(pk=pk)
            item.delete()
            return Response(
                {"message": "The object has been deleted"},
                status=status.HTTP_204_NO_CONTENT,
            )
        except ParameterType.DoesNotExist:
            return Response(
                {"message": "The object does not exist"},
                status=status.HTTP_404_NOT_FOUND,
            )
