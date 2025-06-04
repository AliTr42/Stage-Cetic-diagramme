from django.db import models
from uuid6 import uuid7
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from api.models import Version, ImageFile

class Element(models.Model):
    """
    The element class is an abstract class that represents a generic element in the diagram.
    It contains the common fields and methods for all elements.  
    It is used as a base class for all other elements.
    """
    id = models.UUIDField(primary_key=True, editable=False, default=uuid7)
    availability = models.BooleanField(default=False)
    confidentiality = models.BooleanField(default=False)
    description = models.TextField(blank=True, null=True)
    integrity = models.BooleanField(default=False)
    name = models.CharField(max_length=255)
    notes = models.TextField(blank=True, null=True)
    images = models.ManyToManyField(
        ImageFile, blank=True, null=True, related_name="%(class)s"
    )
    version = models.ForeignKey(
        Version,
        on_delete=models.CASCADE,
        related_name="%(class)s",
        blank=True,
        null=True,
    )

    class Meta:
        abstract = True

    def __str__(self):
        return self.name


class Component(Element):
    """
    The component class represents a component in the diagram.
    It inherits from the Element class and adds a field for the parent component.
    """
    pass

    class Meta:
        db_table = "component"


class SubComponent(Element):
    """
    The subcomponent class represents a subcomponent in the diagram.
    It inherits from the Element class and adds a field for the parent component.
    """
    component = models.ForeignKey(
        Component, on_delete=models.CASCADE, related_name="subcomponents"
    )

    class Meta:
        db_table = "subcomponent"

    def __str__(self):
        return f"{self.component.name} - {self.name}"


class Port(Element):
    """
    The port class represents a port in the diagram.
    It inherits from the Element class and adds a field for the parent component.
    """
    component = models.ForeignKey(
        Component, on_delete=models.CASCADE, related_name="ports"
    )

    class Meta:
        db_table = "port"

    def __str__(self):
        return f"{self.component.name} - {self.name}"


class Interface(Element):
    """
    The interface class represents an interface in the diagram.
    It inherits from the Element class and adds a field for the source and the destination port or subcomponent.
    """
    TYPE_CHOICES = [
        ("internal", "Internal Interface"),
        ("external", "External Interface"),
    ]
    name = models.CharField(max_length=255, blank=True, null=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="external")
    port_from = models.ForeignKey(
        Port,
        on_delete=models.CASCADE,
        related_name="interfaces_from",
        blank=True,
        null=True,
    )
    port_to_port = models.ForeignKey(
        Port,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfaces_to_port",
    )
    port_to_subcomponent = models.ForeignKey(
        SubComponent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interfaces_to_subcomponent",
    )

    class Meta:
        db_table = "interface"

    def clean(self):
        pass

    def __str__(self):
        return f"{self.port_from} <--> {self.port_to_port or self.port_to_subcomponent}"


class ParameterType(models.Model):
    """
    The parameter type class represents a type of parameter in the diagram.
    It contains the common fields and methods for all parameter types.
    """
    description = models.TextField(blank=True, null=True)
    id = models.UUIDField(primary_key=True, editable=False, default=uuid7)
    name = models.CharField(max_length=255)
    generic = models.BooleanField(default=False)

    class Meta:  
        db_table = "parameter_type"

    def __str__(self):  
        return self.name



class Parameter(models.Model):
    """
    The parameter class represents a parameter in the diagram.
    It contains the common fields and methods for all parameters.
    """
    id = models.UUIDField(primary_key=True, editable=False, default=uuid7)
    name = models.CharField(
        max_length=255,
        default="Default parameter",
        help_text="Enter the name of the parameter",
    )
    secret = models.BooleanField(default=False)
    value = models.TextField(blank=True, null=True)
    parameter_type = models.ForeignKey(
        ParameterType,
        on_delete=models.CASCADE,
        related_name="parameters",
        null=True,
        blank=True,
    )
    component = models.ForeignKey(
        Component,
        on_delete=models.CASCADE,
        related_name="parameters",
        null=True,
        blank=True,
    )
    subcomponent = models.ForeignKey(
        SubComponent,
        on_delete=models.CASCADE,
        related_name="parameters",
        null=True,
        blank=True,
    )
    port = models.ForeignKey(
        Port, on_delete=models.CASCADE, related_name="parameters", null=True, blank=True
    )
    interface = models.ForeignKey(
        Interface,
        on_delete=models.CASCADE,
        related_name="parameters",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "parameter"

    def __str__(self):
        return f"{self.name}"
