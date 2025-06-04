from rest_framework import serializers
from .models import *

class ImageFileSerializer(serializers.ModelSerializer):
    
    class Meta:
        model = ImageFile
        fields = ['uuid', 'file', 'default']

class ParameterTypeSerializer(serializers.ModelSerializer):

    class Meta:
        model = ParameterType
        fields = "__all__"

class MinimalParameterTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParameterType
        fields = ["id", "name", "description", "generic"]

class ParameterSerializer(serializers.ModelSerializer):
    element_type = serializers.SerializerMethodField()
    element_detail = serializers.SerializerMethodField()  
    parameter_type = serializers.SlugRelatedField(
        slug_field='name',
        queryset=ParameterType.objects.all()
    )
    parameter_type_detail = MinimalParameterTypeSerializer(source="parameter_type", read_only=True)

    class Meta:
        model = Parameter
        fields = ["id", "name", "value", "secret", "element_type", "element_detail", "parameter_type", "parameter_type_detail"]


    def get_element_type(self, obj):
        if obj.component:
            return "component"
        elif obj.subcomponent:
            return "subcomponent"
        elif obj.port:
            return "port"
        elif obj.interface:
            return "interface"
        return None
    
    def get_element_detail(self, obj):
        if obj.component:
            return MinimalComponentSerializer(obj.component).data
        elif obj.subcomponent:
            return MinimalSubComponentSerializer(obj.subcomponent, context=self.context).data
        elif obj.port:
            return MinimalPortSerializer(obj.port, context=self.context).data
        elif obj.interface:
            return MinimalInterfaceSerializer(obj.interface).data
        return None
    
class DiagramParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parameter
        fields = ["id", "name", "value", "secret", "parameter_type"]

class MinimalParameterSerializer(serializers.ModelSerializer):

    class Meta:
        model = Parameter
        fields = ["id", "name", "value", "secret", "parameter_type"]

class ParameterGETSerializer(serializers.ModelSerializer):
    parameter_type = ParameterTypeSerializer()
    class Meta:
        model = Parameter
        fields =  "__all__"

class CompleteParameterSerializer(serializers.ModelSerializer):
    element_type = serializers.SerializerMethodField()
    element_detail = serializers.SerializerMethodField()
    parameter_type = serializers.SlugRelatedField(
        slug_field='name',
        queryset=ParameterType.objects.all()
    )
    parameter_type_detail = MinimalParameterTypeSerializer(source="parameter_type", read_only=True)
    parent_info = serializers.SerializerMethodField()
    parent_component = serializers.SerializerMethodField()
    connection_details = serializers.SerializerMethodField()

    class Meta:
        model = Parameter
        fields = ["id", "name", "value", "secret", "element_type", "element_detail", 
                  "parameter_type", "parameter_type_detail", "parent_info", "parent_component", "connection_details"]

    def get_element_type(self, obj):
        if obj.component:
            return "component"
        elif obj.subcomponent:
            return "subcomponent"
        elif obj.port:
            return "port"
        elif obj.interface:
            return "interface"
        return None
    
    def get_element_detail(self, obj):
        if obj.component:
            return MinimalComponentSerializer(obj.component).data
        elif obj.subcomponent:
            return MinimalSubComponentSerializer(obj.subcomponent, context=self.context).data
        elif obj.port:
            return MinimalPortSerializer(obj.port, context=self.context).data
        elif obj.interface:
            return MinimalInterfaceSerializer(obj.interface).data
        return None
    
    def get_parent_info(self, obj):
        """Retourne une chaîne formatée avec les informations de parenté ou de connexion"""
        if obj.component:
            return None  
            
        elif obj.subcomponent:
            if obj.subcomponent.component:
                return f"Component: {obj.subcomponent.component.name}"
            return "No parent component"
            
        elif obj.port:
            if obj.port.component:
                return f"Component: {obj.port.component.name}"
            elif obj.port.subcomponent:
                if obj.port.subcomponent.component:
                    return f"SubComponent: {obj.port.subcomponent.name}, Component: {obj.port.subcomponent.component.name}"
                return f"SubComponent: {obj.port.subcomponent.name}"
            return "No parent info"
            
        elif obj.interface:
            info_parts = []
            if obj.interface.port_from:
                info_parts.append(f"From: {obj.interface.port_from.name}")
            
            if obj.interface.port_to_port:
                info_parts.append(f"To: {obj.interface.port_to_port.name}")
            
            if obj.interface.port_to_subcomponent:
                info_parts.append(f"To SubComp: {obj.interface.port_to_subcomponent.name}")
            
            return ", ".join(info_parts) if info_parts else "No connection info"
            
        return None

    def get_parent_component(self, obj):
        """Retourne le composant parent, quel que soit l'élément"""
        if obj.component:
            return None  
        elif obj.subcomponent:
            if obj.subcomponent.component:
                return MinimalComponentSerializer(obj.subcomponent.component).data
            return None
        elif obj.port:
            if obj.port.component:
                return MinimalComponentSerializer(obj.port.component).data
            elif obj.port.subcomponent and obj.port.subcomponent.component:
                return MinimalComponentSerializer(obj.port.subcomponent.component).data
            return None
        elif obj.interface:
            if obj.interface.port_from and obj.interface.port_from.component:
                return MinimalComponentSerializer(obj.interface.port_from.component).data
            return None
        return None
    
    def get_connection_details(self, obj):
        """Pour les interfaces, retourne les détails de connexion"""
        if obj.interface:
            result = {}
            if obj.interface.port_from:
                result["port_from"] = {
                    "id": obj.interface.port_from.id,
                    "name": obj.interface.port_from.name
                }
            if obj.interface.port_to_port:
                result["port_to"] = {
                    "id": obj.interface.port_to_port.id,
                    "name": obj.interface.port_to_port.name
                }
            if obj.interface.port_to_subcomponent:
                result["subcomponent_to"] = {
                    "id": obj.interface.port_to_subcomponent.id,
                    "name": obj.interface.port_to_subcomponent.name
                }
            return result
        return None
    
class MinimalComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Component
        fields = ["id", "name", "description", "availability", "confidentiality", "integrity", "notes"]

class MinimalSubComponentSerializer(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.context.get('hide_component', False):
            self.fields.pop('component', None)
    class Meta:
        model = SubComponent
        fields = ["id","name", "description", "availability", "confidentiality", "integrity", "notes","component"]

class MinimalPortSerializer(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.context.get('hide_component', False):
            self.fields.pop('component', None)
    class Meta:
        model = Port
        fields = ["id","name", "description", "availability", "confidentiality", "integrity", "notes","component"]

class MinimalInterfaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interface
        fields = ["id", "name", "description", "availability", "confidentiality", "integrity", "notes"]

class ComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Component
        fields = "__all__"
    
class DiagramComponentSerializer(serializers.ModelSerializer):
    parameters = DiagramParameterSerializer(many=True, required=False)
    images = serializers.SerializerMethodField()
    
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data
    class Meta:
        model = Component
        fields = "__all__"
    
class ComponentGETSerializer(ComponentSerializer):
    parameters = ParameterGETSerializer(many=True, required=False)
    subcomponents = MinimalSubComponentSerializer(many=True, read_only=True, context={'hide_component': True})
    ports = MinimalPortSerializer(many=True, read_only=True, context={'hide_component': True})
    interfaces = serializers.SerializerMethodField()
    vulnerabilities = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    flowexecutions = serializers.SerializerMethodField()
    sut = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Component
        fields = "__all__"
    
    def get_flowexecutions(self, obj):
        from api.serializers import MiniFlowExecutionGETSerializer 
        return MiniFlowExecutionGETSerializer(obj.flowexecutions.all(), many=True).data
    
    def get_interfaces(self, obj):
        interfaces_qs = Interface.objects.filter(port_from__component=obj)
        return MinimalInterfaceSerializer(interfaces_qs, many=True).data
    
    def get_vulnerabilities(self, obj):
        from api.serializers import VulnerabilityGETSerializer 
        return VulnerabilityGETSerializer(obj.vulnerabilities.all(), many=True).data
    
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data
    
    def get_sut(self, obj):
        from api.serializers import SutSerializer
        return SutSerializer(obj.version.sut).data if obj.version.sut else None
    
    def get_version(self, obj):
        from api.serializers import VersionSerializer
        return VersionSerializer(obj.version).data if obj.version else None

class SubComponentSerializer(serializers.ModelSerializer):

    class Meta:
        model = SubComponent
        fields = "__all__"

class DiagramSubComponentSerializer(serializers.ModelSerializer):
    parameters = DiagramParameterSerializer(many=True, required=False)
    images = serializers.SerializerMethodField()
    
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data
    
    class Meta:
        model = SubComponent
        fields = "__all__"

class SubComponentGETSerializer(serializers.ModelSerializer):
    parameters = ParameterGETSerializer(many=True, required=False)
    vulnerabilities = serializers.SerializerMethodField()
    flowexecutions = serializers.SerializerMethodField()
    sut = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    component = ComponentSerializer()
    images = serializers.SerializerMethodField()

    class Meta:
        model = SubComponent
        fields = "__all__"

    def get_vulnerabilities(self, obj):
        from api.serializers import VulnerabilityGETSerializer 
        return VulnerabilityGETSerializer(obj.vulnerabilities.all(), many=True).data
    
    def get_flowexecutions(self, obj):
        from api.serializers import MiniFlowExecutionGETSerializer 
        return MiniFlowExecutionGETSerializer(obj.flowexecutions.all(), many=True).data
    
    def get_sut(self, obj):
        from api.serializers import SutSerializer
        return SutSerializer(obj.version.sut).data if obj.version.sut else None
    
    def get_version(self, obj):
        from api.serializers import VersionSerializer
        return VersionSerializer(obj.version).data if obj.version else None
    
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data

class PortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Port
        fields = "__all__"

class DiagramPortSerializer(serializers.ModelSerializer):
    parameters = DiagramParameterSerializer(many=True, required=False)
    images = serializers.SerializerMethodField()
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data
    class Meta:
        model = Port
        fields = "__all__"

class PortGETSerializer(serializers.ModelSerializer):
    parameters = ParameterGETSerializer(many=True, required=False)
    vulnerabilities = serializers.SerializerMethodField()
    flowexecutions = serializers.SerializerMethodField()
    sut = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    component = ComponentSerializer()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Port
        fields = "__all__"

    def get_vulnerabilities(self, obj):
        from api.serializers import VulnerabilityGETSerializer 
        return VulnerabilityGETSerializer(obj.vulnerabilities.all(), many=True).data
    
    def get_flowexecutions(self, obj):
        from api.serializers import MiniFlowExecutionGETSerializer 
        return MiniFlowExecutionGETSerializer(obj.flowexecutions.all(), many=True).data
    
    def get_sut(self, obj):
        from api.serializers import SutSerializer
        return SutSerializer(obj.version.sut).data if obj.version.sut else None
    
    def get_version(self, obj):
        from api.serializers import VersionSerializer
        return VersionSerializer(obj.version).data if obj.version else None
    
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data

class InterfaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interface
        fields = "__all__"

class DiagramInterfaceSerializer(serializers.ModelSerializer):
    parameters = DiagramParameterSerializer(many=True, required=False)
    images = serializers.SerializerMethodField()

    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data

    class Meta:
        model = Interface
        fields = "__all__"

class InterfaceGETSerializer(serializers.ModelSerializer):
    parameters = ParameterGETSerializer(many=True, required=False)
    sut = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    port_from = PortGETSerializer()
    port_to_port = PortGETSerializer()
    port_to_subcomponent = SubComponentGETSerializer()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Interface
        fields = "__all__"
    
    def get_sut(self, obj):
        from api.serializers import SutSerializer
        return SutSerializer(obj.version.sut).data if obj.version.sut else None
    
    def get_version(self, obj):
        from api.serializers import VersionSerializer
        return VersionSerializer(obj.version).data if obj.version else None
    def get_images(self, instance):
        from api.serializers import ImageFileSerializer
        return ImageFileSerializer(instance.images.all(), many=True).data


