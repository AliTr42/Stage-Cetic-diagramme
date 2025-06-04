import {
  Component,
  OnInit,
  AfterViewInit,
  ElementRef,
  ViewChild,
  EventEmitter,
  Output,
  Input,
  OnDestroy,
  HostListener,
} from '@angular/core';
import * as joint from 'jointjs';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { DiagramService } from '../../services/diagram.service';
import { ComponentModel } from '../../models/component';
import { MaterialModule } from 'app/material.module';
import html2canvas from 'html2canvas';
import { MenuService } from 'app/services/menu.service';
import { VersionService } from 'app/services/version.service';
import { ImageFile } from 'app/models/image-file';
import { UtilsService } from 'app/utils/utils';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-diagram-builder',
  standalone: true,
  imports: [MaterialModule],
  templateUrl: './diagram-builder.component.html',
  styleUrls: ['./diagram-builder.component.css'],
})
export class DiagramBuilderComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  // JointJS diagram elements
  @ViewChild('diagramContainer') diagramContainer!: ElementRef;
  graph!: joint.dia.Graph; // Modèle de données JointJS
  paper!: joint.dia.Paper; // Vue de rendu JointJS
  // Element creation and selection properties
  pendingPosition: { x: number; y: number } | null = null; // Position for new elements
  selectedInterfaceType: 'internal' | 'external' | null = null; // Type of interface being created
  isInterfaceMode: boolean = false; // Whether interface creation mode is active
  currentElement: joint.dia.Cell | null = null; // Currently selected/active element (can be Element or Link)
  selectedElement: joint.dia.Element | null = null; // Element selected for interface connection
  // Form management properties
  componentForm: FormGroup; // Form for component properties
  showComponentForm: boolean = false; // Controls component form visibility
  isEditMode: boolean = false; // Whether editing existing component or creating new
  isSubComponentEditMode: boolean = false; // Whether editing existing subcomponent
  isPortEditMode: boolean = false; // Whether editing existing port
  isInterfaceEditMode: boolean = false; // Whether editing existing interface
  // reference data
  parameterTypes: any[] = []; // Available parameter types from API
  imageFiles: ImageFile[] = []; // Images attached to current element
  data?: ComponentModel; // Optional input data for component

  // Subcomponent form management
  subComponentForm: FormGroup;
  showSubComponentForm: boolean = false;
  // Port form management
  portForm: FormGroup;
  showPortForm: boolean = false;
  // Parent component reference for nested elements
  currentParentComponent: joint.dia.Element | null = null;

  // Interface form management
  interfaceForm: FormGroup;
  showInterfaceForm: boolean = false;
  pendingInterfaceData: any = null; // Data for interface being created

  // Source port reference for interface connections
  private sourcePort: joint.dia.Element | null = null;

  // Input data properties
  private _diagramInput?: any; // Input configuration for the diagram
  private _version?: any; // Version data for saving/loading
  // Context identifiers
  sutId?: string; // System Under Test ID
  versionId?: string; // Version ID
  componentId?: string; // Component ID
  subcomponentId?: string; // Subcomponent ID
  portId?: string; // Port ID
  // UI state management
  isDragging: boolean = false; // Whether an element is being dragged
  clickSaved: boolean = false; // Whether a click has been processed
  // Map to store timeouts for debouncing resize operations
  private resizeTimeouts = new Map<string, any>();

  // Zoom properties
  zoomLevel: number = 1;
  private minZoom: number = 0.2;
  private maxZoom: number = 3;
  private zoomStep: number = 0.1;
  showZoomControls: boolean = true;

  // Event emitter for parent component communication
  @Output() public actionProcess: EventEmitter<any> = new EventEmitter<any>();
  get version(): any | undefined {
    return this._version;
  }
  @Input() set version(value: any | undefined) {
    // Vérifier si la valeur est undefined ou null
    if (!value) {
      console.warn('Version non définie');
      this._version = null;
      return;
    }

    // Vérifier si c'est la même version
    if (this._version && this._version.uuid === value.uuid && this.clickSaved) {
      this.clickSaved = false;
      return;
    }
    this._version = value;
    this.initAllInfoDiagram();
  }

  get diagramInput(): any | undefined {
    return this._diagramInput;
  }

  @Input() set diagramInput(value: any | undefined) {
    // Vérifier si la version a changé
    //const oldVersionId = this._diagramInput?.versionId;

    // Mettre à jour les données d'entrée
    this._diagramInput = value;
    if (value) {
      this.sutId = value.sutId ? value.sutId : null;
      this.versionId = value.versionId ? value.versionId : null;
      this.componentId = value.componentId ? value.componentId : null;
      this.subcomponentId = value.subcomponentId ? value.subcomponentId : null;
      this.portId = value.portId ? value.portId : null;
    }
  }

  /**
   * Component constructor
   * Initializes all form groups and dependencies
   */
  constructor(
    private fb: FormBuilder,
    private diagramService: DiagramService,
    private _menuService: MenuService,
    private _versionService: VersionService,
    public utilsService: UtilsService,
    public _snackBar: MatSnackBar,
    private elementRef: ElementRef
  ) {
    // Initialize component form
    this.componentForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      availability: [false],
      confidentiality: [false],
      integrity: [false],
      notes: [''],
      //version: [null],
      parameters: this.fb.array([]),
    });

    // Initialize subcomponent form
    this.subComponentForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      availability: [false],
      confidentiality: [false],
      integrity: [false],
      notes: [''],
      //version: [null],
      parameters: this.fb.array([]),
    });

    // Initialize port form
    this.portForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      availability: [false],
      confidentiality: [false],
      integrity: [false],
      notes: [''],
      //version: [null],
      parameters: this.fb.array([]),
    });

    // Initialize interface form
    this.interfaceForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      availability: [false],
      confidentiality: [false],
      integrity: [false],
      notes: [''],
      //version: [null],
      type: ['external'], // Will be set based on selectedInterfaceType
      parameters: this.fb.array([]),
    });
  }

  ngOnInit(): void {
    this.diagramService.getParameterType().subscribe(
      (types) => {
        this.parameterTypes = types;
      },
      (error) =>
        console.error(
          'Erreur lors du chargement des types de paramètres:',
          error
        )
    );
  }

  initAllInfoDiagram() {
    if (this.graph) this.graph.clear(); // Clear the graph if it exists
    this.initDiagram();

    // Attendre que tout soit initialisé
    setTimeout(() => {
      // Vérifier s'il y a une sauvegarde à restaurer pour cette version spécifique
      this.loadSavedDiagram();
      // Configurer la sauvegarde automatique
      this.setupAutoSave();
    });

    const buttons = document.querySelectorAll('button:not([type="submit"])');
    buttons.forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  ngAfterViewInit(): void {
    this.initAllInfoDiagram();
  }

  /**
   * Initialize the JointJS diagram
   * Sets up the graph, paper, and all event handlers for diagram interactions
   * @private
   */
  private initDiagram(): void {
    // Initialize the JointJS graph (data model)
    this.graph = new joint.dia.Graph();
    // Configure paper (visualization) options
    const paperOptions = {
      el: this.diagramContainer.nativeElement,
      model: this.graph,
      width: '100%',
      height: '100%',
      gridSize: 10,
      drawGrid: true,
      // Default Manhattan router with padding
      defaultRouter: {
        name: 'manhattan',
        args: {
          padding: 20,
          startDirections: ['right', 'left', 'top', 'bottom'],
          endDirections: ['right', 'left', 'top', 'bottom'],
        },
      },

      defaultConnector: { name: 'rounded' },
      // Connection validation callback
      validateConnection: (
        sourceView: any,
        sourceMagnet: any,
        targetView: any,
        targetMagnet: any
      ) => {
        return this.validateConnectionType(sourceView.model, targetView.model);
      },
      // Interactive settings
      interactive: {
        elementMove: true,
        addLinkFromMagnet: false,
        vertexAdd: false,
        vertexMove: false,
        vertexRemove: false,
        linkMove: true,
      },
    };
    this.applyZoom();
    // Create the paper with options
    this.paper = new joint.dia.Paper(paperOptions);

    // Define a custom resize tool for components
    const ResizeTool = joint.elementTools.Control.extend({
      // Tool visual elements
      children: [
        // Resize handle
        {
          tagName: 'image',
          selector: 'handle',
          attributes: {
            cursor: 'pointer',
            width: 20,
            height: 20,
            'xlink:href':
              'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAtOTYwIDk2MCA5NjAiIHdpZHRoPSIyNHB4IiBmaWxsPSIjMDAwMEZGIj48cGF0aCBkPSJNNTYwLTI4MGgyMDB2LTIwMGgtODB2MTIwSDU2MHY4MFpNMjAwLTQ4MGg4MHYtMTIwaDEyMHYtODBIMjAwdjIwMFptLTQgMzIwcS0zMyAwLTU2LjUtMjMuNVQ4MC0yNDB2LTQ4MHEwLTMzIDIzLjUtNTYuNVQxNjAtODAwaDY0MHEzMyAwIDU2LjUgMjMuNVQ4ODAtNzIwdjQ4MHEwIDMzLTIzLjUgNTYuNVQ4MDAtMTYwSDE2MFptMC04MGg2NDB2LTQ4MEgxNjB2NDgwWm0wIDB2LTQ4MCA0ODB6Ii8+PC9zdmc+',
          },
        },
        // Resize preview outline
        {
          tagName: 'rect',
          selector: 'extras',
          attributes: {
            'pointer-events': 'none',
            fill: 'none',
            stroke: '#33334F',
            'stroke-dasharray': '2,4',
            rx: 5,
            ry: 5,
          },
        },
      ],
      // Get current position of the resize handle
      getPosition: function (view: any) {
        const model = view.model;
        const { width, height } = model.size();
        return { x: width, y: height };
      },
      // Handle position change during resize
      setPosition: function (view: any, coordinates: any) {
        const model = view.model;
        const previousWidth = model.size().width;
        const previousHeight = model.size().height;

        // Resize with minimum dimensions to prevent too small components
        model.resize(
          Math.max(coordinates.x - 10, 200),
          Math.max(coordinates.y - 10, 120)
        );

        // Trigger resize event
        view.paper.trigger('element:resized', view);
      },
    });

    // Add resize tool to components on click
    this.paper.on(
      'element:pointerdown',
      (elementView: joint.dia.ElementView) => {
        const element = elementView.model;
        if (element.get('type') === 'component') {
          // Add resize tool if not already present
          if (!elementView.hasTools()) {
            const resizeTool = new ResizeTool({
              selector: 'body', // Select element body for resize
            });

            const toolsView = new joint.dia.ToolsView({
              tools: [resizeTool],
            });

            elementView.addTools(toolsView);
            elementView.showTools();
          }
        }
      }
    );

    // Event handlers section

    // Handle element resize events
    this.paper.on('element:resize', (elementView: joint.dia.ElementView) => {
      const element = elementView.model;
      if (element.get('type') === 'component') {
        // Reorganize internal elements after resize
        this.organizeSubcomponents(element);

        // Update connected links
        const connectedLinks = this.graph.getConnectedLinks(element);
        connectedLinks.forEach((link) => link.reparent());
      }
    });

    // Handle size change events
    this.graph.on('change:size', (cell: joint.dia.Cell) => {
      if (cell.get('type') === 'component') {
        // Reorganize subcomponents when component size changes
        this.organizeSubcomponents(cell as joint.dia.Element);

        // Update connected links
        const connectedLinks = this.graph.getConnectedLinks(cell);
        connectedLinks.forEach((link) => link.reparent());
      }
    });

    // Click and double-click handling
    let clickTimeout: any = null;
    let preventSingleClick = false;

    // Element pointer down handler (handles both single and double clicks)
    this.paper.on(
      'element:pointerdown',
      (elementView: joint.dia.ElementView, evt: any) => {
        if (clickTimeout !== null) {
          // Double-click detected
          preventSingleClick = true;
          clearTimeout(clickTimeout);
          clickTimeout = null;

          // Handle double-click for editing
          if (!this.isInterfaceMode) {
            const element = elementView.model;
            this.currentElement = element;

            // Element-specific editing
            this.handleElementDoubleClick(elementView);
            return;
          }
        } else {
          // First click - wait for potential double-click
          clickTimeout = setTimeout(() => {
            clickTimeout = null;
            if (!preventSingleClick) {
              // Handle single click for interface connections
              if (this.isInterfaceMode) {
                this.handleConnection(elementView);
              }
            }
            preventSingleClick = false;
          }, 300); // 300ms delay for double-click detection
        }
      }
    );

    // Link double-click handler for editing interfaces
    this.paper.on(
      'link:pointerdblclick',
      (linkView: joint.dia.LinkView, evt: any) => {
        evt.stopPropagation();
        const link = linkView.model;

        // Get interface data and ID
        const interfaceData = link.get('interfaceData');
        const backendId = link.get('backendId');

        if (interfaceData && backendId) {
          // Set up for editing
          this.isInterfaceEditMode = true;
          this.currentElement = link;
          this.pendingInterfaceData = { ...interfaceData, id: backendId };

          // Clear existing parameters
          while (this.interfaceParametersFormArray.length !== 0) {
            this.interfaceParametersFormArray.removeAt(0);
          }

          // Fill the form with interface data
          this.interfaceForm.patchValue({
            name: interfaceData.name || '',
            description: interfaceData.description || '',
            availability: interfaceData.availability || false,
            confidentiality: interfaceData.confidentiality || false,
            integrity: interfaceData.integrity || false,
            notes: interfaceData.notes || '',
            type: interfaceData.type || 'external',
          });

          // Add parameters if they exist
          if (interfaceData.parameters && interfaceData.parameters.length > 0) {
            interfaceData.parameters.forEach((param: any) => {
              // Extract parameter type properly
              let parameterType = param.parameter_type;

              // If it's an object, extract the name or ID
              if (parameterType && typeof parameterType === 'object') {
                parameterType = parameterType.name || parameterType.id;
              }

              const paramGroup = this.fb.group({
                id: [param.id || null],
                name: [param.name || '', Validators.required],
                value: [param.value || ''],
                secret: [param.secret || false],
                parameter_type: [parameterType],
              });
              this.interfaceParametersFormArray.push(paramGroup);
            });
          }

          // Handle images
          if (interfaceData?.images && interfaceData?.images.length > 0) {
            this.imageFiles = interfaceData.images.map(
              (image: any) => new ImageFile(image)
            );
            if (!this.imageFiles.some((image) => image.default)) {
              this.imageFiles[0].default = true;
            }
          }

          // Load interface details if needed
          if (interfaceData.id) {
            this.diagramService
              .getInterfaceDiagramById(interfaceData.id)
              .subscribe({
                next: (_interface) => {},
                error: (error) => {
                  console.error('Failed to load component images:', error);
                },
              });
          }

          // Show the interface form
          this.showInterfaceForm = true;
        }
      }
    );

    // Add click handler for links in interface mode
    this.paper.on(
      'link:pointerclick',
      (linkView: joint.dia.LinkView, evt: any) => {
        if (this.isInterfaceMode) {
          // Handle click for interface creation mode
          evt.stopPropagation();
        }
      }
    );

    // Size change handler for component layout
    this.graph.on('change:size', (cell: joint.dia.Cell) => {
      if (cell.get('type') === 'component') {
        // Reorganize internal layout
        this.organizeSubcomponents(cell as joint.dia.Element);

        // Update connected links
        const connectedLinks = this.graph.getConnectedLinks(cell);
        connectedLinks.forEach((link) => link.reparent());
      }
    });

    // Add to the initDiagram method after the existing event handlers

    // Event handlers for showing tooltips on hover
    this.paper.on(
      'element:mouseenter',
      (elementView: joint.dia.ElementView) => {
        const element = elementView.model;
        const elementType = element.get('type');

        // Only show tooltip for ports
        if (elementType === 'port') {
          const componentData = element.get('componentData');
          if (componentData && componentData.name) {
            this.showTooltip(elementView, componentData.name);
          }
        }
      }
    );

    this.paper.on('element:mouseleave', () => {
      this.hideTooltip();
    });

    // Also handle interfaces (links)
    this.paper.on('link:mouseenter', (linkView: joint.dia.LinkView) => {
      const link = linkView.model;
      const interfaceData = link.get('interfaceData');

      if (interfaceData && interfaceData.name) {
        this.showTooltip(linkView, interfaceData.name);
      }
    });

    this.paper.on('link:mouseleave', () => {
      this.hideTooltip();
    });
  }

  // Gérer les connexions entre composants
  private handleConnection(elementView: joint.dia.ElementView): void {
    const element = elementView.model;
    const elementType = element.get('type');

    // Vérifier que l'élément est d'un type valide pour les connexions
    const isValidElementType =
      elementType === 'port' || elementType === 'subcomponent';

    // Si l'élément n'est pas d'un type valide, ignorer le clic
    if (!isValidElementType) {
      return;
    }

    // Si c'est le même élément qui est cliqué
    if (this.selectedElement === element) {
      // Restaurer la couleur d'origine selon le type
      if (elementType === 'port') {
        element.attr('body/fill', '#f1c40f');
      } else if (elementType === 'subcomponent') {
        element.attr('body/fill', '#9b59b6');
      }
      this.selectedElement = null;
      return;
    }

    // Si un autre élément était déjà sélectionné
    if (this.selectedElement) {
      const previousType = this.selectedElement.get('type');
      // Restore original color of previous element
      if (previousType === 'port') {
        this.selectedElement.attr('body/fill', '#f1c40f');
      } else if (previousType === 'subcomponent') {
        this.selectedElement.attr('body/fill', '#9b59b6');
      }

      // Get backend IDs
      const sourceId = this.selectedElement.get('backendId');
      const targetId = element.get('backendId');

      if (!sourceId || !targetId) {
        console.error('Missing backend IDs');
        this.selectedElement = null;
        return;
      }

      // Check if the connection is valid
      const isValidConnection = this.validateConnectionType(
        this.selectedElement,
        element
      );

      if (!isValidConnection) {
        console.error('Invalid connection between these elements');
        this.selectedElement = null;
        return;
      }

      // Clear any previous interface data to ensure we're creating a new one
      this.isInterfaceEditMode = false;
      this.pendingInterfaceData = null;

      // Determine the element types
      const sourceType = this.selectedElement.get('type');
      const targetType = element.get('type');

      // Prepare interface data for both internal and external interfaces
      this.prepareInterfaceData(sourceType, targetType, sourceId, targetId);

      // Store source for reference in form submission
      this.sourcePort = this.selectedElement;
      this.currentElement = this.selectedElement;

      // Show form for both interface types
      this.showInterfaceForm = true;

      this.selectedElement = null;
    } else {
      // First click - select the element
      this.selectedElement = element;
      element.attr('body/fill', '#2ecc71'); // Green to indicate selection
    }
  }

  private createSubComponent(): null {
    // First show a form to collect data
    const parentView = this.paper
      .findViewsFromPoint(this.pendingPosition!)
      .find((view) => view.model.get('type') === 'component');

    if (!parentView) {
      console.error('No parent component found');
      return null;
    }

    // Get the parent component's data
    const parentComponent = parentView.model;
    const parentData = parentComponent.get('componentData');
    const parentId = parentData.id;

    // Show form for subcomponent data
    this.showSubComponentForm = true;
    this.currentParentComponent = parentComponent;

    this.imageFiles = []; // Reset image files for the new subcomponent

    // Reset the subcomponent form
    this.subComponentForm.reset({
      name: '',
      description: '',
      availability: false,
      confidentiality: false,
      integrity: false,
      notes: '',
    });

    return null; // We'll create the actual element after form submission
  }

  // Replace your current port creation logic
  private createPort(): void {
    // First show a form to collect data
    const parentView = this.paper
      .findViewsFromPoint(this.pendingPosition!)
      .find((view) => view.model.get('type') === 'component');

    if (!parentView) {
      console.error('No parent component found');
      return;
    }

    // Get the parent component's data
    const parentComponent = parentView.model;
    const parentData = parentComponent.get('componentData');

    this.imageFiles = []; // Reset image files for the new port

    // Show form for port data
    this.showPortForm = true;
    this.currentParentComponent = parentComponent;

    // Reset the port form
    this.portForm.reset({
      name: '',
      description: '',
      availability: false,
      confidentiality: false,
      integrity: false,
      notes: '',
    });

    // Actual element will be created after form submission
  }

  private validateConnectionType(
    source: joint.dia.Cell,
    target: joint.dia.Cell
  ): boolean {
    const sourceParent = this.graph.getCell(source.get('parent'));
    const targetParent = this.graph.getCell(target.get('parent'));

    if (this.selectedInterfaceType === 'internal') {
      // Permettre port→sous-composant OU sous-composant→port,
      // mais ils doivent être dans le même composant parent
      const isPort =
        source.get('type') === 'port' || target.get('type') === 'port';
      const isSubcomp =
        source.get('type') === 'subcomponent' ||
        target.get('type') === 'subcomponent';

      return isPort && isSubcomp && sourceParent === targetParent;
    } else if (this.selectedInterfaceType === 'external') {
      // Pour les externes: uniquement port vers port dans des parents différents
      return (
        source.get('type') === 'port' &&
        target.get('type') === 'port' &&
        sourceParent !== targetParent
      );
    }
    return false;
  }

  // Modifier la méthode createInterface()
  private createInterface(
    source: joint.dia.Element,
    target: joint.dia.Element
  ): joint.dia.Link {
    const isInternal = this.selectedInterfaceType === 'internal';
    const { sourceAnchor, targetAnchor } = this.determineOptimalAnchors(
      source,
      target,
      isInternal
    );

    // Configuration du routeur en fonction du type d'interface
    let routerConfig;

    if (isInternal) {
      routerConfig = {
        name: 'orthogonal', // Utiliser orthogonal pour les interfaces internes
        args: {
          padding: 10,
          elementPadding: 5,
          directions: ['left', 'right', 'top', 'bottom'],
          // Add exclusions to avoid passing through other elements
          excludeTypes: ['subcomponent'],
          // Add penalties to discourage certain paths
          penalty: {
            // Apply high penalty to subcomponents to ensure paths go around them
            itemType: {
              subcomponent: 1000, // Higher value = stronger avoidance
            },
          },
        },
      };
    } else {
      routerConfig = {
        name: 'manhattan',
        args: {
          padding: 20,
          startDirections: [sourceAnchor.name],
          endDirections: [targetAnchor.name],
          excludeTypes: ['component', 'subcomponent'],
          step: 20,
          maximumLoops: 2000,
          penalty: {
            paddingBox: 50,
            itemType: {
              subcomponent: 500,
            },
          },
        },
      };
    }

    const link = new joint.shapes.standard.Link({
      source: {
        id: source.id,
        anchor: sourceAnchor,
        connectionPoint: { name: 'boundary' },
      },
      target: {
        id: target.id,
        anchor: targetAnchor,
        connectionPoint: { name: 'boundary' },
      },
      router: routerConfig,
      connector: { name: isInternal ? 'normal' : 'rounded' }, // Connexion plus simple pour les interfaces internes
      attrs: {
        line: {
          stroke: isInternal ? '#e74c3c' : '#2ecc71',
          strokeWidth: 2,
          targetMarker: {
            type: 'path',
            d: 'M -10 -5 0 0 -10 5 z',
            fill: isInternal ? '#e74c3c' : '#2ecc71',
          },
          cursor: 'pointer',
        },
      },
      interactive: true,
    });

    // Définir explicitement le type comme 'interface'
    link.set('type', 'interface');
    link.set('interfaceType', isInternal ? 'internal' : 'external');
    return link;
  }

  // Méthode pour déterminer les meilleurs points d'ancrage
  private determineOptimalAnchors(
    source: joint.dia.Element,
    target: joint.dia.Element,
    isInternal: boolean
  ): {
    sourceAnchor: any;
    targetAnchor: any;
  } {
    // Cas pour les interfaces internes (port vers subcomponent ou l'inverse)
    if (isInternal) {
      const sourceType = source.get('type');
      const targetType = target.get('type');

      // Déterminer quel élément est le port et lequel est le sous-composant
      let portElement, subcompElement;

      if (sourceType === 'port' && targetType === 'subcomponent') {
        portElement = source;
        subcompElement = target;
      } else if (sourceType === 'subcomponent' && targetType === 'port') {
        portElement = target;
        subcompElement = source;
      } else {
        return {
          sourceAnchor: { name: 'center' },
          targetAnchor: { name: 'center' },
        };
      }

      // Calculer la direction optimale en fonction des positions relatives
      const portPos = portElement.position();
      const subcompPos = subcompElement.position();
      const dx = subcompPos.x - portPos.x;
      const dy = subcompPos.y - portPos.y;

      // Pour le port, on utilise les ancrages nommés standards
      let portAnchor = { name: 'center' };
      // Pour le sous-composant, on utilisera des ancrages personnalisés au milieu des bords
      let subcompAnchor;

      // Déterminer les ancrages optimaux basés sur l'orientation relative
      if (Math.abs(dx) > Math.abs(dy)) {
        // Connexion horizontale plus importante
        if (dx > 0) {
          // Port à gauche du sous-composant
          portAnchor = { name: 'right' };
          subcompAnchor = { name: 'modelCenter', args: { side: 'left' } };
        } else {
          // Port à droite du sous-composant
          portAnchor = { name: 'left' };
          subcompAnchor = { name: 'modelCenter', args: { side: 'right' } };
        }
      } else {
        // Connexion verticale plus importante
        if (dy > 0) {
          // Port au-dessus du sous-composant
          portAnchor = { name: 'bottom' };
          subcompAnchor = { name: 'modelCenter', args: { side: 'top' } };
        } else {
          // Port en-dessous du sous-composant
          portAnchor = { name: 'top' };
          subcompAnchor = { name: 'modelCenter', args: { side: 'bottom' } };
        }
      }

      // Assembler les résultats selon la configuration source/cible
      if (sourceType === 'port') {
        return {
          sourceAnchor: portAnchor,
          targetAnchor: subcompAnchor,
        };
      } else {
        return {
          sourceAnchor: subcompAnchor,
          targetAnchor: portAnchor,
        };
      }
    } else {
      // Pour les interfaces externes, utiliser la logique existante
      const sourceAnchor = this.getExternalAnchor(source);
      const targetAnchor = this.getExternalAnchor(target);
      return { sourceAnchor, targetAnchor };
    }
  }

  private getExternalAnchor(element: joint.dia.Element): { name: string } {
    const parent = this.graph.getCell(element.get('parent'));
    if (!parent) return { name: 'center' };

    const elementBBox = element.getBBox();
    const parentBBox = parent.getBBox();

    // Déterminer quel côté est le plus proche du bord du parent
    const distToLeft = elementBBox.x - parentBBox.x;
    const distToRight = parentBBox.x + parentBBox.width - elementBBox.x;
    const distToTop = elementBBox.y - parentBBox.y;
    const distToBottom = parentBBox.y + parentBBox.height - elementBBox.y;

    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    if (minDist === distToLeft) return { name: 'left' };
    if (minDist === distToRight) return { name: 'right' };
    if (minDist === distToTop) return { name: 'top' };
    return { name: 'bottom' };
  }

  selectInterfaceType(type: 'internal' | 'external' | null): void {
    if (this.selectedInterfaceType === type) {
      // Désélectionner si on clique sur le même type
      this.selectedInterfaceType = null;
      this.isInterfaceMode = false;
    } else {
      this.selectedInterfaceType = type;
      this.isInterfaceMode = true;
    }
  }

  // Update the prepareInterfaceData method:
  private prepareInterfaceData(
    sourceType: string,
    targetType: string,
    sourceId: string,
    targetId: string
  ): void {
    this.imageFiles = []; // Reset image files for the new interface
    if (this.selectedInterfaceType === 'internal') {
      if (sourceType === 'port' && targetType === 'subcomponent') {
        // Port to subcomponent
        this.pendingInterfaceData = {
          port_from: sourceId,
          port_to_subcomponent: targetId,
          port_to_port: null,
          type: this.selectedInterfaceType,
          target_element_id: targetId,
        };
      } else if (sourceType === 'subcomponent' && targetType === 'port') {
        // Subcomponent to port
        this.pendingInterfaceData = {
          port_from: targetId, // Le port est maintenant la cible
          port_to_port: null,
          port_to_subcomponent: sourceId, // Le sous-composant est la source
          type: this.selectedInterfaceType,
          target_element_id: targetId,
        };
      }
    } else {
      // Interface externe: toujours port vers port
      this.pendingInterfaceData = {
        port_from: sourceId,
        port_to_port: targetId,
        port_to_subcomponent: null,
        type: this.selectedInterfaceType,
        target_element_id: targetId,
      };
    }

    // Reset le formulaire avec des valeurs par défaut
    this.interfaceForm.reset({
      name: `Interface ${this.selectedInterfaceType}`,
      description: '',
      availability: false,
      confidentiality: false,
      integrity: false,
      notes: '',
      type: this.selectedInterfaceType,
    });
  }

  // Méthode pour organiser les sous-composants en fonction de la forme du composant parent
  private organizeSubcomponents(parent: joint.dia.Element): void {
    const embeds = parent.getEmbeddedCells();
    const subcomponents = embeds.filter(
      (cell) => cell.get('type') === 'subcomponent'
    ) as joint.dia.Element[];
    const ports = embeds.filter(
      (cell) => cell.get('type') === 'port'
    ) as joint.dia.Element[];

    if (subcomponents.length === 0) return;

    const PADDING = 20;
    const SPACING_H = 15; // Espacement horizontal entre composants
    const SPACING_V = 15; // Espacement vertical entre composants
    const HEADER_HEIGHT = 60; // Espace pour le label du composant parent

    // Obtenir la taille actuelle du parent
    const parentSize = parent.size();
    const parentWidth = parentSize.width;

    // Taille du premier sous-composant (on assume qu'ils sont tous de même taille)
    const subcompWidth = subcomponents[0].size().width;
    const subcompHeight = subcomponents[0].size().height;

    // Calculer combien de sous-composants peuvent tenir horizontalement avec la largeur actuelle
    const availableWidth = parentWidth - 2 * PADDING;
    const maxComponentsPerRow = Math.max(
      1,
      Math.floor((availableWidth + SPACING_H) / (subcompWidth + SPACING_H))
    );

    // Calculer le nombre de lignes nécessaires
    const rows = Math.ceil(subcomponents.length / maxComponentsPerRow);

    // Calculer la hauteur requise
    const requiredHeight = Math.max(
      120, // hauteur minimale
      HEADER_HEIGHT + rows * subcompHeight + (rows - 1) * SPACING_V + PADDING
    );

    // Ajuster uniquement la hauteur si nécessaire, préserver la largeur définie par l'utilisateur
    if (requiredHeight > parentSize.height) {
      parent.resize(parentWidth, requiredHeight);
    }

    // Organiser les sous-composants en grille adaptée à la largeur du composant
    subcomponents.forEach((embed: joint.dia.Element, index: number) => {
      const row = Math.floor(index / maxComponentsPerRow);
      const col = index % maxComponentsPerRow;

      // Position horizontale: distribuer uniformément dans la largeur disponible
      let xPosition: number;
      if (maxComponentsPerRow === 1) {
        // Si une seule colonne, centrer le sous-composant
        xPosition = (parentWidth - subcompWidth) / 2;
      } else {
        // Sinon, distribuer les sous-composants uniformément
        const totalWidthUsed =
          maxComponentsPerRow * subcompWidth +
          (maxComponentsPerRow - 1) * SPACING_H;
        const leftPadding = (availableWidth - totalWidthUsed) / 2 + PADDING;
        xPosition = leftPadding + col * (subcompWidth + SPACING_H);
      }

      // Position verticale
      const yPosition = HEADER_HEIGHT + row * (subcompHeight + SPACING_V);

      // Positionner le sous-composant
      embed.position(xPosition, yPosition, { parentRelative: true });
    });

    // Réajuster la position des ports
    ports.forEach((port: joint.dia.Element) => {
      const portSize = port.size();
      const portEdge = port.get('edge');
      const relativePosition = port.get('relativePosition') || 0.5;

      if (portEdge) {
        switch (portEdge) {
          case 'left':
            port.position(
              0,
              Math.round(
                relativePosition * parentSize.height - portSize.height / 2
              ),
              { parentRelative: true }
            );
            break;
          case 'right':
            port.position(
              parentWidth - portSize.width,
              Math.round(
                relativePosition * parentSize.height - portSize.height / 2
              ),
              { parentRelative: true }
            );
            break;
          case 'top':
            port.position(
              Math.round(relativePosition * parentWidth - portSize.width / 2),
              0,
              { parentRelative: true }
            );
            break;
          case 'bottom':
            port.position(
              Math.round(relativePosition * parentWidth - portSize.width / 2),
              parentSize.height - portSize.height,
              { parentRelative: true }
            );
            break;
          default:
            this.snapPortToBorder(port, parent);
            break;
        }
      } else {
        this.snapPortToBorder(port, parent);
      }
    });
  }

  // Attacher un port au bord le plus proche
  private snapPortToBorder(
    port: joint.dia.Element,
    parent: joint.dia.Element
  ): void {
    const parentSize = parent.size();
    const portSize = port.size();

    // Obtenir la position absolue du port
    const portAbsPos = this.pendingPosition;
    if (!portAbsPos) {
      console.error('Port absolute position is null');
      return;
    }

    // Convertir en position relative par rapport au parent
    const parentPos = parent.position();
    const portRelPos = {
      x: portAbsPos.x - parentPos.x,
      y: portAbsPos.y - parentPos.y,
    };

    // Calculer les distances aux quatre bords
    const distToLeft = portRelPos.x;
    const distToRight = parentSize.width - portRelPos.x - portSize.width;
    const distToTop = portRelPos.y;
    const distToBottom = parentSize.height - portRelPos.y - portSize.height;

    // Trouver le bord le plus proche
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    let edge: 'left' | 'right' | 'top' | 'bottom';

    if (minDist === distToLeft) {
      edge = 'left';
      port.position(0, portRelPos.y, { parentRelative: true });
    } else if (minDist === distToRight) {
      edge = 'right';
      port.position(parentSize.width - portSize.width, portRelPos.y, {
        parentRelative: true,
      });
    } else if (minDist === distToTop) {
      edge = 'top';
      port.position(portRelPos.x, 0, { parentRelative: true });
    } else {
      edge = 'bottom';
      port.position(portRelPos.x, parentSize.height - portSize.height, {
        parentRelative: true,
      });
    }

    // Stocker l'information sur le bord et la position relative le long de ce bord
    port.set('edge', edge);

    // Stocker la position relative le long du bord (important pour maintenir la position après redimensionnement)
    if (edge === 'left' || edge === 'right') {
      port.set('relativePosition', portRelPos.y / parentSize.height);
    } else {
      port.set('relativePosition', portRelPos.x / parentSize.width);
    }
  }

  onDragStart(event: DragEvent, elementType: string): void {
    if (event.dataTransfer) {
      event.dataTransfer.setData('elementType', elementType);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  // Update your onDrop method
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!event.dataTransfer) return;

    const elementType = event.dataTransfer.getData('elementType');
    const rect = this.diagramContainer.nativeElement.getBoundingClientRect();

    this.pendingPosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    switch (elementType) {
      case 'component':
        // Show component form
        this.showComponentForm = true;
        break;

      case 'subcomponent':
        // Now handled by createSubComponent
        this.createSubComponent();
        break;

      case 'port':
        // Now handled by createPort
        this.createPort();
        break;
    }

    this.selectedInterfaceType = null;
    this.isInterfaceMode = false;
  }

  submitComponentForm(): void {
    if (!this.componentForm.valid) {
      return;
    }

    const formData = new FormData();
    if (this.versionId) {
      formData.append('version', this.versionId);
    }
    // Process basic form fields
    this.processFormFields(formData, this.componentForm.value);
    // Handle parameters
    this.serializeParameters(formData, this.componentForm.value.parameters);

    // Handle images
    this.serializeImages(formData);

    // Déterminer l'ID à utiliser pour la mise à jour
    let componentId: string | undefined;

    if (this.data && this.data.id) {
      // Cas 1: Mise à jour depuis le formulaire de données
      componentId = this.data.id;
    } else if (this.isEditMode && this.currentElement) {
      // Cas 2: Mise à jour depuis le diagramme
      componentId = this.currentElement.get('backendId');
    }

    if (componentId) {
      // Mise à jour du composant existant
      this.diagramService.updateComponent(componentId, formData).subscribe({
        next: (updatedComponent) => {
          console.log('Component updated successfully:', updatedComponent);

          // Mettre à jour les données locales
          if (this.data) {
            this.data = updatedComponent;
          }

          // Mettre à jour le diagramme si nécessaire
          if (this.currentElement) {
            this.updateComponentInDiagram(updatedComponent);
          }

          // Rafraîchir la liste du menu
          this.updateDiagramVersion();
          this._menuService.getMenuList();

          // Notification de succès
          this._snackBar.open('Component detail updated!', 'Done', {
            duration: 3000,
          });

          this.closeComponentForm();
        },
        error: (err) => {
          console.error('Error updating component:', err);
          this._snackBar.open('Error updating component', 'Error', {
            duration: 3000,
          });
        },
      });
    } else {
      // Création d'un nouveau composant
      this.diagramService.addComponent(formData).subscribe({
        next: (createdComponent) => {
          console.log('Component created successfully:', createdComponent);
          const compId = createdComponent.id;

          // Créer l'élément visuel et l'ajouter au graphe
          const componentElement =
            this.createComponentFromForm(createdComponent);
          this.graph.addCell(componentElement);

          this.updateDiagramVersion();
          this._menuService.getMenuList();
          this.closeComponentForm();
        },
        error: (error) => {
          console.error('Error creating component:', error);
          alert('Failed to create component in backend');
        },
      });
    }
  }

  private updateComponentInDiagram(data: ComponentModel): void {
    if (!this.currentElement) return;

    // Update visual representation
    this.currentElement.attr('label/text', data.name || 'Component');

    // Update stored data
    this.currentElement.set('componentData', data);
  }

  private updateInterfaceInDiagram(data: any): void {
    if (!this.currentElement) return;

    // S'assurer que c'est bien un lien
    if (!(this.currentElement instanceof joint.dia.Link)) {
      console.error('Current element is not a link');
      return;
    }

    // Mettre à jour uniquement les données stockées
    this.currentElement.set('interfaceData', data);
    this.currentElement.set('interfaceType', data.type);
  }

  cancelComponentForm(): void {
    this.closeComponentForm();
  }

  private closeComponentForm(): void {
    this.showComponentForm = false;
    this.isEditMode = false;
    this.currentElement = null;

    // Reset form
    this.componentForm.reset({
      name: '',
      description: '',
      availability: false,
      confidentiality: false,
      integrity: false,
      notes: '',
    });

    // Clear parameters
    while (this.parametersFormArray.length !== 0) {
      this.parametersFormArray.removeAt(0);
    }
  }

  private createComponentFromForm(data: any): joint.dia.Element {
    const component = new joint.shapes.standard.Rectangle({
      position: this.pendingPosition || { x: 0, y: 0 },
      size: { width: 200, height: 120 },
      attrs: {
        body: {
          fill: '#3498db',
          stroke: '#2980b9',
          strokeWidth: 2,
          rx: 5,
          ry: 5,
        },
        label: {
          text: data.name || 'Component',
          fill: 'white',
          fontSize: 14,
          fontWeight: 'bold',
          refX: '50%',
          refY: 30,
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
        },
      },
    });

    component.set('type', 'component');
    component.set('componentData', data); // Store the complete component data
    component.set('backendId', data.id); // Store the backend ID

    return component;
  }

  private openComponentFormForEdit(element: joint.dia.Element): void {
    // Get the component data from the element
    const componentData = element.get('componentData');

    if (!componentData) {
      console.error('No component data found for this element');
      return;
    }

    // Clear existing parameters and images first
    while (this.parametersFormArray.length !== 0) {
      this.parametersFormArray.removeAt(0);
    }
    this.imageFiles = []; // Reset images array

    // Set edit mode
    this.isEditMode = true;
    this.currentElement = element;

    // Fill the form with the component data
    this.componentForm.patchValue({
      name: componentData.name || '',
      description: componentData.description || '',
      availability: componentData.availability || false,
      confidentiality: componentData.confidentiality || false,
      integrity: componentData.integrity || false,
      notes: componentData.notes || '',
    });
    if (componentData?.images && componentData?.images.length > 0) {
      this.imageFiles = componentData.images.map(
        (image: any) => new ImageFile(image)
      );
      if (!this.imageFiles.some((image) => image.default)) {
        this.imageFiles[0].default = true;
      }
    }

    // Add parameters if they exist
    if (componentData.parameters && componentData.parameters.length > 0) {
      componentData.parameters.forEach((param: any) => {
        const paramGroup = this.fb.group({
          id: [param.id || null],
          name: [param.name || '', Validators.required],
          value: [param.value || ''],
          secret: [param.secret || false],
          parameter_type: [param.parameter_type || null],
        });
        this.parametersFormArray.push(paramGroup);
      });
    }

    // Load the images if they exist
    /*if (componentData.id) {
      // Fetch component details to get images
      this.diagramService.getComponentDiagramById(componentData.id).subscribe({
        next: (component) => {},
        error: (error) => {
          console.error('Failed to load component images:', error);
        },
      });
    }*/

    // Show the form
    this.showComponentForm = true;
  }

  // Getter pour accéder au FormArray des paramètres
  get parametersFormArray() {
    return this.componentForm.get('parameters') as FormArray;
  }

  // Méthode pour ajouter un paramètre
  addParameter() {
    const paramGroup = this.fb.group({
      name: ['', Validators.required],
      value: [''],
      secret: [false],
      parameter_type: [null], // Initialement null, à sélectionner dans la liste
    });
    this.parametersFormArray.push(paramGroup);
  }

  // Méthode pour supprimer un paramètre
  removeParameter(index: number) {
    this.parametersFormArray.removeAt(index);
  }

  // Add a new method to handle subcomponent form submission
  submitSubComponentForm(): void {
    if (!this.subComponentForm.valid || !this.currentParentComponent) {
      return;
    }

    const formData = new FormData();

    // Add parent component reference without JSON.stringify
    const parentData = this.currentParentComponent.get('componentData');
    formData.append('component', parentData.id);

    // Process basic form fields
    this.processFormFields(formData, this.subComponentForm.value);

    // Handle parameters
    this.serializeParameters(formData, this.subComponentForm.value.parameters);

    // Handle images
    this.serializeImages(formData);

    // Logique de création/mise à jour
    if (this.isSubComponentEditMode && this.currentElement) {
      const backendId = this.currentElement.get('backendId');
      if (!backendId) {
        console.error('Cannot update subcomponent: No backend ID found');
        return;
      }

      // Mise à jour du sous-composant
      this.diagramService.updateSubComponent(backendId, formData).subscribe({
        next: (updatedSubComponent) => {
          console.log(
            'Subcomponent updated successfully:',
            updatedSubComponent
          );
          this.updateSubComponentInDiagram(updatedSubComponent);

          // Mettre à jour les données locales
          if (this.currentElement) {
            this.currentElement.set('componentData', updatedSubComponent);
          }

          this.updateDiagramVersion();
          this._menuService.getMenuList();

          this._snackBar.open('Subcomponent detail updated!', 'Done', {
            duration: 3000,
          });

          this.closeSubComponentForm();
        },
        error: (err) => {
          console.error('Error updating subcomponent:', err);
          this._snackBar.open('Error updating subcomponent', 'Error', {
            duration: 3000,
          });
        },
      });
    } else {
      // Création d'un nouveau sous-composant
      this.diagramService.addSubComponent(formData).subscribe({
        next: (createdSubComponent) => {
          console.log(
            'Subcomponent created successfully:',
            createdSubComponent
          );

          const newSubComponent = new joint.shapes.standard.Rectangle({
            position: this.pendingPosition || { x: 0, y: 0 },
            size: { width: 90, height: 40 },
            attrs: {
              body: {
                fill: '#9b59b6',
                stroke: '#8e44ad',
                strokeWidth: 2,
                rx: 4,
                ry: 4,
                magnet: true,
              },
              label: {
                text: createdSubComponent.name || 'Subcomponent',
                fill: 'white',
                fontSize: 12,
                refX: '50%',
                refY: '50%',
                textAnchor: 'middle',
                textVerticalAnchor: 'middle',
              },
            },
          });

          newSubComponent.set('type', 'subcomponent');
          newSubComponent.set('componentData', createdSubComponent);
          newSubComponent.set('backendId', createdSubComponent.id);

          this.graph.addCell(newSubComponent);
          if (this.currentParentComponent) {
            this.currentParentComponent.embed(newSubComponent);
            this.organizeSubcomponents(this.currentParentComponent);
          }

          this.updateDiagramVersion();
          this._menuService.getMenuList();

          this._snackBar.open('Subcomponent created successfully!', 'Done', {
            duration: 3000,
          });

          this.closeSubComponentForm();
        },
        error: (error) => {
          console.error('Error creating subcomponent:', error);
          this._snackBar.open('Failed to create subcomponent', 'Error', {
            duration: 3000,
          });
        },
      });
    }
  }

  // Add a new method to handle port form submission
  submitPortForm(): void {
    if (!this.portForm.valid || !this.currentParentComponent) {
      return;
    }

    const formData = new FormData();

    // Add parent component reference
    const parentData = this.currentParentComponent.get('componentData');
    formData.append('component', parentData.id);

    // Process basic form fields
    this.processFormFields(formData, this.portForm.value);

    // Handle parameters
    this.serializeParameters(formData, this.portForm.value.parameters);

    // Handle images
    this.serializeImages(formData);

    // Logique de création/mise à jour
    if (this.isPortEditMode && this.currentElement) {
      const backendId = this.currentElement.get('backendId');
      if (!backendId) {
        console.error('Cannot update port: No backend ID found');
        return;
      }

      // Mise à jour du port
      this.diagramService.updatePort(backendId, formData).subscribe({
        next: (updatedPort) => {
          console.log('Port updated successfully:', updatedPort);
          this.updatePortInDiagram(updatedPort);

          // Mettre à jour les données locales
          if (this.currentElement) {
            this.currentElement.set('componentData', updatedPort);
          }

          this.updateDiagramVersion();
          this._menuService.getMenuList();

          this._snackBar.open('Port detail updated!', 'Done', {
            duration: 3000,
          });

          this.closePortForm();
        },
        error: (err) => {
          console.error('Error updating port:', err);
          this._snackBar.open('Error updating port', 'Error', {
            duration: 3000,
          });
        },
      });
    } else {
      // Création d'un nouveau port
      this.diagramService.addPort(formData).subscribe({
        next: (createdPort) => {
          console.log('Port created successfully:', createdPort);

          const newPort = new joint.shapes.standard.Rectangle({
            position: this.pendingPosition || { x: 0, y: 0 },
            size: { width: 24, height: 24 },
            attrs: {
              body: {
                fill: '#f1c40f',
                stroke: '#f39c12',
                strokeWidth: 2,
                magnet: true,
                port: 'port',
                rx: 3,
                ry: 3,
              },
            },
          });

          newPort.set('type', 'port');
          newPort.set('componentData', createdPort);
          newPort.set('backendId', createdPort.id);

          this.graph.addCell(newPort);
          if (this.currentParentComponent) {
            this.currentParentComponent.embed(newPort);
            this.snapPortToBorder(newPort, this.currentParentComponent);
          }

          this.updateDiagramVersion();
          this._menuService.getMenuList();

          this._snackBar.open('Port created successfully!', 'Done', {
            duration: 3000,
          });

          this.closePortForm();
        },
        error: (error) => {
          console.error('Error creating port:', error);
          this._snackBar.open('Failed to create port', 'Error', {
            duration: 3000,
          });
        },
      });
    }
  }

  private showTooltip(view: joint.dia.CellView, text: string): void {
    // Remove any existing tooltip
    this.hideTooltip();

    const element = view.model;
    let tooltipContent = text; // Default to element name
    let showElementName = true; // Flag to determine if we should show element name

    // For ports and interfaces, check for IP/MAC parameters
    const componentData = element.get('componentData');
    const interfaceData = element.get('interfaceData');
    const data = componentData || interfaceData;

    interface ParamType {
      name: string;
      value: string;
      secret?: boolean;
      parameter_type?: any;
    }

    if (data && data.parameters && data.parameters.length > 0) {
      // Look for IP or MAC parameters
      const ipParams = data.parameters.filter(
        (p: ParamType) => p.name.toLowerCase().startsWith('ip') && p.value
      );

      const macParams = data.parameters.filter(
        (p: ParamType) => p.name.toLowerCase().startsWith('mac') && p.value
      );

      // Build tooltip content
      let networkInfo: string[] = [];

      // Add IP addresses
      if (ipParams.length > 0) {
        ipParams.forEach((param: ParamType) => {
          networkInfo.push(`${param.name}: ${param.value}`);
        });
      }

      // Add MAC addresses
      if (macParams.length > 0) {
        macParams.forEach((param: ParamType) => {
          networkInfo.push(`${param.name}: ${param.value}`);
        });
      }

      // If we found network info, use that instead of the name
      if (networkInfo.length > 0) {
        tooltipContent = networkInfo.join('<br>');
        showElementName = false; // Don't show element name when we have network info
      }
    }

    // If we don't have any IP/MAC info and the element has no name, don't show tooltip
    if (tooltipContent.trim() === '') {
      return;
    }

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.innerHTML = tooltipContent; // Use innerHTML to support line breaks

    // Style the tooltip
    Object.assign(this.tooltip.style, {
      position: 'absolute',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '5px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      zIndex: '10000',
      pointerEvents: 'none',
      maxWidth: '250px',
      whiteSpace: 'normal',
      overflow: 'hidden',
    });

    // Position the tooltip
    const paperOffset = this.paper.el.getBoundingClientRect();

    // For elements (ports)
    if ('getBBox' in view.model) {
      const bbox = view.model.getBBox();
      const scaledBBox = {
        x: bbox.x * this.zoomLevel + paperOffset.left,
        y: bbox.y * this.zoomLevel + paperOffset.top,
        width: bbox.width * this.zoomLevel,
        height: bbox.height * this.zoomLevel,
      };

      this.tooltip.style.left = `${scaledBBox.x + scaledBBox.width / 2}px`;
      this.tooltip.style.top = `${scaledBBox.y - 28}px`;
      this.tooltip.style.transform = 'translateX(-50%)';
    }
    // For links (interfaces)
    else if (view instanceof joint.dia.LinkView) {
      const linkMiddlePoint = view.getPointAtLength(
        view.getConnectionLength() / 2
      );
      const x = linkMiddlePoint.x * this.zoomLevel + paperOffset.left;
      const y = linkMiddlePoint.y * this.zoomLevel + paperOffset.top;

      this.tooltip.style.left = `${x}px`;
      this.tooltip.style.top = `${y - 20}px`;
      this.tooltip.style.transform = 'translateX(-50%)';
    }

    document.body.appendChild(this.tooltip);
  }

  private hideTooltip(): void {
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
      this.tooltip = null;
    }
  }

  // Add these properties to the component class
  private tooltip: HTMLElement | null = null;

  // Add these methods to your component class

  submitInterfaceForm(): void {
    if (this.interfaceForm.valid && this.pendingInterfaceData) {
      const formData = new FormData();

      // Process basic form fields
      this.processFormFields(formData, this.interfaceForm.value);

      // Add the interface-specific data
      formData.append('port_from', this.pendingInterfaceData.port_from);
      if (this.pendingInterfaceData.port_to_port) {
        formData.append('port_to_port', this.pendingInterfaceData.port_to_port);
      }
      if (this.pendingInterfaceData.port_to_subcomponent) {
        formData.append(
          'port_to_subcomponent',
          this.pendingInterfaceData.port_to_subcomponent
        );
      }
      formData.append('type', this.selectedInterfaceType || 'external');

      this.serializeParameters(formData, this.interfaceForm.value.parameters);

      // Handle images
      this.serializeImages(formData);

      // Create or update
      if (this.isInterfaceEditMode && this.currentElement) {
        // Get interface id
        const backendId = this.currentElement.get('backendId');

        if (!backendId) {
          console.error('No backend ID found for interface');
          return;
        }

        this.diagramService.updateInterface(backendId, formData).subscribe({
          next: (updatedInterface) => {
            console.log('Interface updated successfully:', updatedInterface);
            this.updateInterfaceInDiagram(updatedInterface);
            this.closeInterfaceForm();
          },
          error: (error) => {
            console.error('Error updating interface:', error);
            this._snackBar.open('Error updating interface', 'Error', {
              duration: 3000,
            });
          },
        });
      } else {
        this.diagramService.addInterface(formData).subscribe({
          next: (createdInterface) => {
            console.log('Interface created successfully:', createdInterface);

            // Store reference to both source and target elements directly
            const sourceElement = this.sourcePort;
            let targetElement = null;

            if (sourceElement) {
              const sourceType = sourceElement.get('type');

              // Find target element based on interface type and source type
              this.graph.getElements().forEach((element) => {
                const backendId = element.get('backendId');

                // For internal interfaces
                if (createdInterface.type === 'internal') {
                  // If source is a port, target should be a subcomponent
                  if (
                    sourceType === 'port' &&
                    element.get('type') === 'subcomponent' &&
                    backendId === this.pendingInterfaceData.port_to_subcomponent
                  ) {
                    targetElement = element;
                  }
                  // If source is a subcomponent, target should be a port
                  else if (
                    sourceType === 'subcomponent' &&
                    element.get('type') === 'port' &&
                    backendId === this.pendingInterfaceData.port_from
                  ) {
                    targetElement = element;
                  }
                }
                // For external interfaces (port to port)
                else if (
                  createdInterface.type === 'external' &&
                  element.get('type') === 'port' &&
                  backendId === this.pendingInterfaceData.port_to_port
                ) {
                  targetElement = element;
                }
              });

              console.log('Source element:', sourceElement);
              console.log('Target element:', targetElement);

              if (sourceElement && targetElement) {
                // Set the interface type properly based on the created interface
                this.selectedInterfaceType =
                  createdInterface.type === 'internal'
                    ? 'internal'
                    : 'external';

                // Create a visual link with proper source and target
                const interfaceLink = this.createInterface(
                  sourceElement,
                  targetElement
                );
                interfaceLink.set('backendId', createdInterface.id);
                interfaceLink.set('interfaceData', createdInterface);
                this.graph.addCell(interfaceLink);

                console.log('Interface link created:', interfaceLink);
              } else {
                console.error(
                  'Source or target element not found in the diagram',
                  'Source ID:',
                  this.pendingInterfaceData.port_from,
                  'Target ID port:',
                  this.pendingInterfaceData.port_to_port,
                  'Target ID subcomponent:',
                  this.pendingInterfaceData.port_to_subcomponent
                );
              }
            }

            this.updateDiagramVersion();
            this.closeInterfaceForm();
          },
          error: (error) => {
            console.error('Error creating interface:', error);
            this._snackBar.open('Error creating interface', 'Error', {
              duration: 3000,
            });
          },
        });
      }
    }
  }

  private closeInterfaceForm(): void {
    this.showInterfaceForm = false;
    this.pendingInterfaceData = null;
    this.isInterfaceEditMode = false; // Add this line to reset edit mode

    // Reset selection
    if (
      this.currentElement &&
      this.currentElement instanceof joint.dia.Element
    ) {
      this.currentElement = null;
    }

    // Réinitialiser le port source
    if (this.sourcePort) {
      this.sourcePort = null; // Important: réinitialiser sourcePort
    }

    // Reset image files
    this.imageFiles = []; // Add this line to reset images

    // Effacer les paramètres
    while (this.interfaceParametersFormArray.length !== 0) {
      this.interfaceParametersFormArray.removeAt(0);
    }
  }

  cancelInterfaceForm(): void {
    this.closeInterfaceForm();
  }

  // Getter for interface parameter form array
  get interfaceParametersFormArray() {
    return this.interfaceForm.get('parameters') as FormArray;
  }

  // Add parameter to interface form
  addInterfaceParameter() {
    const paramGroup = this.fb.group({
      name: ['', Validators.required],
      value: [''],
      secret: [false],
      parameter_type: [null],
    });
    this.interfaceParametersFormArray.push(paramGroup);
  }

  // Remove parameter from interface form
  removeInterfaceParameter(index: number) {
    this.interfaceParametersFormArray.removeAt(index);
  }

  // Ajouter ces getters pour les différents types de paramètres
  // Nous avons déjà parametersFormArray pour les composants et interfaceParametersFormArray pour les interfaces

  // Getter pour accéder au FormArray des paramètres de sous-composant
  get subComponentParametersFormArray() {
    return this.subComponentForm.get('parameters') as FormArray;
  }

  // Getter pour accéder au FormArray des paramètres de port
  get portParametersFormArray() {
    return this.portForm.get('parameters') as FormArray;
  }

  // Méthodes pour ajouter/supprimer des paramètres de sous-composant
  addSubComponentParameter() {
    const paramGroup = this.fb.group({
      name: ['', Validators.required],
      value: [''],
      secret: [false],
      parameter_type: [null],
    });
    this.subComponentParametersFormArray.push(paramGroup);
  }

  removeSubComponentParameter(index: number) {
    this.subComponentParametersFormArray.removeAt(index);
  }

  // Méthodes pour ajouter/supprimer des paramètres de port
  addPortParameter() {
    const paramGroup = this.fb.group({
      name: ['', Validators.required],
      value: [''],
      secret: [false],
      parameter_type: [null],
    });
    this.portParametersFormArray.push(paramGroup);
  }

  removePortParameter(index: number) {
    this.portParametersFormArray.removeAt(index);
  }

  // Ajouter cette méthode à votre classe DiagramBuilderComponent
  exportDiagram(): void {
    // Obtenir l'élément DOM contenant le diagramme
    const diagramElement = this.diagramContainer.nativeElement;

    // Afficher un message pour indiquer que l'export est en cours
    const loadingMessage = document.createElement('div');
    loadingMessage.innerText = "Génération de l'image...";
    loadingMessage.style.position = 'absolute';
    loadingMessage.style.top = '50%';
    loadingMessage.style.left = '50%';
    loadingMessage.style.transform = 'translate(-50%, -50%)';
    loadingMessage.style.padding = '10px';
    loadingMessage.style.background = 'rgba(0,0,0,0.7)';
    loadingMessage.style.color = 'white';
    loadingMessage.style.borderRadius = '5px';
    loadingMessage.style.zIndex = '1000';
    document.body.appendChild(loadingMessage);

    // Utiliser html2canvas pour capturer le diagramme
    html2canvas(diagramElement, {
      backgroundColor: '#f0f0f0',
      scale: 2, // Meilleure qualité
      logging: false,
      allowTaint: true,
      useCORS: true,
    })
      .then((canvas) => {
        // Convertir le canvas en image
        const imageData = canvas.toDataURL('image/png');

        // Créer un lien de téléchargement
        const link = document.createElement('a');
        link.href = imageData;
        link.download = `diagram-export-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/:/g, '-')}.png`;

        // Déclencher le téléchargement
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Supprimer le message de chargement
        document.body.removeChild(loadingMessage);

        // Afficher un message de confirmation
        alert('Diagramme exporté avec succès!');
      })
      .catch((error) => {
        console.error('Error exporting diagram:', error);
        document.body.removeChild(loadingMessage);
        alert("Erreur lors de l'export du diagramme");
      });
  }

  // Configuration de la sauvegarde automatique
  private setupAutoSave(): void {
    if (!this.graph) {
      console.error('Erreur: this.graph is not initialized');
      return;
    }

    this.isDragging = false;
    let initialPosition: { x: number; y: number } | null = null;
    let initialSizeMap = new Map<string, { width: number; height: number }>();

    // Événement de début de drag
    this.paper.on('cell:pointerdown', (cellView) => {
      console.log('cell:pointerdown -------------');
      this.isDragging = true;
      initialPosition = { ...cellView.model.position() }; // Sauvegarde la position initiale
    });

    // Événement de fin de drag - sauvegarde uniquement si la position a changé
    this.paper.on('cell:pointerup', (cellView) => {
      console.log('cell:pointerup -------------');
      if (this.isDragging) {
        this.isDragging = false;
        const newPosition = cellView.model.position();
        if (
          initialPosition &&
          (newPosition.x !== initialPosition.x ||
            newPosition.y !== initialPosition.y)
        ) {
          console.log('Position changed, saving diagram...');
          this.updateDiagramVersion();
        }
      }
    });

    // Sauvegarder uniquement après que l'utilisateur a fini de redimensionner
    this.graph.on('change:size', (cell, newSize, opt) => {
      console.log('change:size -------------', newSize, opt);

      const cellId = cell.id;

      // Sauvegarde de la taille initiale avant toute modification
      if (!initialSizeMap.has(cellId)) {
        initialSizeMap.set(cellId, {
          width: newSize.width,
          height: newSize.height,
        });
      }

      // Débouncer la sauvegarde pour éviter les sauvegardes multiples pendant le redimensionnement
      if (this.resizeTimeouts.has(cellId)) {
        clearTimeout(this.resizeTimeouts.get(cellId)); // Annule la sauvegarde précédente en attente
      }

      this.resizeTimeouts.set(
        cellId,
        setTimeout(() => {
          const initialSize = initialSizeMap.get(cellId);
          if (
            initialSize &&
            (initialSize.width !== newSize.width ||
              initialSize.height !== newSize.height)
          ) {
            console.log('Size changed, saving diagram...');
            this.updateDiagramVersion();
            initialSizeMap.set(cellId, {
              width: newSize.width,
              height: newSize.height,
            }); // Mise à jour après sauvegarde
          }
          this.resizeTimeouts.delete(cellId); // Nettoyage après exécution
        }, 500) // Temps d'attente avant d'enregistrer (ajuster si nécessaire)
      );
    });
  }

  // Nouvelle méthode qui contient la logique de sauvegarde actuelle
  private updateDiagramVersion(): void {
    this.clickSaved = true;
    const timestamp = Date.now();

    try {
      // 1. Sauvegarder la structure complète du graphe
      const graphJSON = this.graph.toJSON();

      // 2. Récupérer les références des éléments backend
      const elementMapping = {
        cells: this.graph.getCells().map((cell) => {
          return {
            id: cell.id,
            backendId: cell.get('backendId'),
            type: cell.get('type'),
          };
        }),
      };

      // 3. Créer l'objet de sauvegarde
      const saveData = {
        timestamp,
        graphStructure: graphJSON,
        elementMapping,
      };

      // 4. Sauvegarder avec la clé spécifique à la version
      const formData = new FormData();
      formData.append('onlyJson', '1');
      formData.append('diagram_json', JSON.stringify(saveData));

      this._versionService
        .updateVersion(this.version.uuid, formData)
        .subscribe({
          next: (val: any) => {
            console.log('Diagramme sauvegardé avec succès');
            this.actionProcess.emit({ action: 'refresh' });
          },
          error: (err: any) => {
            console.error('Erreur lors de la sauvegarde du diagramme:', err);
          },
        });

      console.log(`Diagramme sauvegardé pour la version ${this.versionId}`);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    }
  }

  // Nettoyage lors de la destruction du composant
  ngOnDestroy(): void {
    this.resizeTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.resizeTimeouts.clear();
    this.hideTooltip(); // Clean up any tooltips
  }

  // Restauration du diagramme
  private restoreDiagram(savedData: any): void {
    try {
      console.log('Début de la restauration du diagramme...');

      // Nettoyage léger (ne pas appeler cleanupOldDiagramSaves ici - important!)
      // Car cela perturbe la restauration

      // 1. Stocker une copie des données pour éviter les problèmes de référence
      const graphDataCopy = JSON.parse(
        JSON.stringify(savedData.graphStructure)
      );
      const cellsCopy = JSON.parse(
        JSON.stringify(savedData.elementMapping.cells)
      );

      // 2. Effacer le graphe actuel
      this.graph.clear();

      // 3. Restaurer les éléments dans le bon ordre
      // D'abord les composants principaux
      cellsCopy.forEach((cellInfo: any) => {
        if (cellInfo.type === 'component') {
          this.restoreComponent(cellInfo, graphDataCopy);
        }
      });

      // Ensuite les sous-composants et ports
      cellsCopy.forEach((cellInfo: any) => {
        if (cellInfo.type === 'subcomponent' || cellInfo.type === 'port') {
          this.restoreEmbeddedElement(cellInfo, graphDataCopy);
        }
      });

      // Enfin les liens
      cellsCopy.forEach((cellInfo: any) => {
        const cellData = graphDataCopy.cells.find(
          (c: any) => c.id === cellInfo.id
        );
        const isLink =
          cellInfo.type === 'interface' ||
          (cellData && cellData.source && cellData.target);

        if (isLink) {
          this.restoreLink(cellInfo, graphDataCopy);
        }
      });

      // 4. Restaurer les données backend
      this.restoreElementData(cellsCopy);

      console.log('Diagramme restauré avec succès');
    } catch (error) {
      console.error('Erreur lors de la restauration:', error);
    }
  }

  // Restaurer un composant
  private restoreComponent(cellInfo: any, graphData: any): void {
    try {
      // Trouver les données du composant dans graphData
      const cellData = graphData.cells.find((c: any) => c.id === cellInfo.id);
      if (!cellData) return;

      // Créer un nouveau composant
      const component = new joint.shapes.standard.Rectangle({
        id: cellInfo.id, // Utiliser le même ID pour préserver les références
        position: cellData.position,
        size: cellData.size,
        attrs: cellData.attrs || {
          body: {
            fill: '#3498db',
            stroke: '#2980b9',
            strokeWidth: 2,
            rx: 5,
            ry: 5,
          },
          label: {
            text: 'Component',
            fill: 'white',
            fontSize: 14,
            fontWeight: 'bold',
            refX: '50%',
            refY: 30,
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
          },
        },
      });

      // Définir les propriétés
      component.set('type', 'component');
      component.set('backendId', cellInfo.backendId);

      // Ajouter au graphe
      this.graph.addCell(component);
    } catch (e) {
      console.error('Erreur lors de la restauration du composant:', e);
    }
  }

  // Restaurer un sous-composant ou port
  private restoreEmbeddedElement(cellInfo: any, graphData: any): void {
    try {
      // Trouver les données de l'élément
      const cellData = graphData.cells.find((c: any) => c.id === cellInfo.id);
      if (!cellData) return;

      // Déterminer le type et les attributs
      const isPort = cellInfo.type === 'port';
      const attrs =
        cellData.attrs ||
        (isPort
          ? {
              body: {
                fill: '#f1c40f',
                stroke: '#f39c12',
                strokeWidth: 2,
                magnet: true,
                port: 'port',
                rx: 3,
                ry: 3,
              },
            }
          : {
              body: {
                fill: '#9b59b6',
                stroke: '#8e44ad',
                strokeWidth: 2,
                rx: 4,
                ry: 4,
                magnet: true,
              },
              label: {
                text: 'Subcomponent',
                fill: 'white',
                fontSize: 12,
                refX: '50%',
                refY: '50%',
                textAnchor: 'middle',
                textVerticalAnchor: 'middle',
              },
            });

      // Créer l'élément
      const element = new joint.shapes.standard.Rectangle({
        id: cellInfo.id,
        position: cellData.position,
        size: cellData.size,
        attrs: attrs,
      });

      // Définir les propriétés
      element.set('type', cellInfo.type);
      element.set('backendId', cellInfo.backendId);

      // Pour les ports, restaurer les propriétés spéciales
      if (isPort) {
        if (cellData.edge) {
          element.set('edge', cellData.edge);
        }
        if (cellData.relativePosition) {
          element.set('relativePosition', cellData.relativePosition);
        }
      }

      // Ajouter au graphe
      this.graph.addCell(element);

      // Rétablir le parent si nécessaire
      const parent = this.graph.getCell(cellData.parent);
      if (parent) {
        parent.embed(element);
      }
    } catch (e) {
      console.error("Erreur lors de la restauration de l'élément embarqué:", e);
    }
  }

  // Restaurer un lien/interface
  private restoreLink(cellInfo: any, graphData: any): void {
    try {
      // Trouver les données du lien
      const cellData = graphData.cells.find((c: any) => c.id === cellInfo.id);
      if (!cellData) {
        console.warn('Données non trouvées pour le lien:', cellInfo.id);
        return;
      }

      // Vérifier que source et cible existent
      const sourceId = cellData.source.id || cellData.source;
      const targetId = cellData.target.id || cellData.target;

      // Récupérer les éléments source et cible
      const sourceElement = this.graph.getCell(sourceId);
      const targetElement = this.graph.getCell(targetId);

      if (!sourceElement || !targetElement) {
        console.warn(
          'Source ou cible manquante pour le lien:',
          cellInfo.id,
          'Source:',
          sourceId,
          'Cible:',
          targetId
        );
        return;
      }

      // Déterminer le type d'interface
      const interfaceType =
        cellData.interfaceType ||
        (cellInfo.type === 'interface'
          ? cellInfo.interfaceType || 'external'
          : null);

      // Récupérer les ancres si disponibles
      const sourceAnchor = cellData.source.anchor || { name: 'center' };
      const targetAnchor = cellData.target.anchor || { name: 'center' };

      // Configure the router based on interface type
      let router = cellData.router || {
        name: 'manhattan',
        args: { padding: interfaceType === 'internal' ? 5 : 20 },
      };

      // Special configuration for internal interfaces to avoid subcomponents
      if (interfaceType === 'internal') {
        router = {
          name: 'orthogonal',
          args: {
            padding: 10,
            elementPadding: 5,
            directions: ['left', 'right', 'top', 'bottom'],
            excludeTypes: ['subcomponent'],
            penalty: {
              itemType: {
                subcomponent: 1000,
              },
            },
          },
        };
      }

      // Créer le lien avec des références explicites
      const link = new joint.shapes.standard.Link({
        id: cellInfo.id,
        source: {
          id: sourceElement.id,
          anchor: sourceAnchor,
          connectionPoint: { name: 'boundary' },
        },
        target: {
          id: targetElement.id,
          anchor: targetAnchor,
          connectionPoint: { name: 'boundary' },
        },
        router: router,
        connector: cellData.connector || { name: 'rounded' },
        attrs: cellData.attrs || {
          line: {
            stroke: interfaceType === 'internal' ? '#e74c3c' : '#2ecc71',
            strokeWidth: 2,
            targetMarker: {
              type: 'path',
              d: 'M -10 -5 0 0 -10 5 z',
              fill: interfaceType === 'internal' ? '#e74c3c' : '#2ecc71',
            },
            cursor: 'pointer',
          },
        },
      });

      // Définir explicitement le type comme 'interface'
      link.set('type', 'interface');
      link.set('interfaceType', interfaceType);

      // Restaurer l'ID backend
      if (cellInfo.backendId) {
        link.set('backendId', cellInfo.backendId);
      }

      // Ajouter au graphe
      this.graph.addCell(link);

      console.log('Lien restauré:', cellInfo.id, 'Type:', interfaceType);
    } catch (e) {
      console.error('Erreur lors de la restauration du lien:', e);
    }
  }

  // Restaurer les données des éléments depuis le backend
  private restoreElementData(cells: any[]): void {
    cells.forEach((cellInfo) => {
      const cell = this.graph.getCell(cellInfo.id);
      const backendId = cellInfo.backendId;

      if (!cell || !backendId) return;

      // S'assurer que l'ID backend est bien attaché à l'élément
      cell.set('backendId', backendId);

      // Restaurer les données selon le type d'élément
      switch (cellInfo.type) {
        case 'component':
          this.diagramService.getComponentDiagramById(backendId).subscribe({
            next: (data) => {
              cell.set('componentData', data);
              cell.attr('label/text', data.name || 'Component');
            },
            error: (err) => {
              console.error('Erreur chargement composant:', err);
              // Ne pas faire échouer la restauration complète
              // Mettre une valeur par défaut
              cell.attr('label/text', 'Component');
            },
          });
          break;

        case 'subcomponent':
          this.diagramService.getSubComponentDiagramById(backendId).subscribe({
            next: (data) => {
              cell.set('componentData', data);
              cell.attr('label/text', data.name || 'Subcomponent');
            },
            error: (err) => {
              console.error('Erreur chargement sous-composant:', err);
              cell.attr('label/text', 'Subcomponent');
            },
          });
          break;

        case 'port':
          this.diagramService.getPortDiagramById(backendId).subscribe({
            next: (data) => {
              cell.set('componentData', data);
            },
            error: (err) => console.error('Erreur chargement port:', err),
          });
          break;

        case 'interface':
          this.diagramService.getInterfaceDiagramById(backendId).subscribe({
            next: (data) => {
              cell.set('interfaceData', data);
            },
            error: (err) => console.error('Erreur chargement interface:', err),
          });
          break;
      }
    });
  }

  // Charger le diagramme sauvegardé
  // Charger le diagramme sauvegardé avec vérification d'existence
  private loadSavedDiagram(): void {
    console.log(
      `Tentative de chargement du diagramme pour la version ${this.versionId}...`
    );

    // Vérifier que this.version existe
    if (!this.version) {
      console.warn('Aucune version trouvée pour le chargement du diagramme');
      return;
    }

    // Vérifier que diagram_json existe
    if (!this.version.diagram_json) {
      console.warn(
        'Aucune donnée de diagramme (diagram_json) trouvée dans la version'
      );
      return;
    }

    try {
      const savedData = JSON.parse(this.version.diagram_json);
      this.restoreDiagram(savedData);
    } catch (error) {
      console.error(
        'Erreur lors du parsing des données JSON du diagramme:',
        error
      );
    }
  }

  private handleElementDoubleClick(elementView: joint.dia.ElementView): void {
    const element = elementView.model;
    const elementType = element.get('type');

    this.currentElement = element;

    switch (elementType) {
      case 'component':
        this.openComponentFormForEdit(element);
        break;
      case 'subcomponent':
        this.openSubComponentFormForEdit(element);
        break;
      case 'port':
        this.openPortFormForEdit(element);
        break;
      default:
        // For other elements, use the existing name editing functionality
        const bbox = elementView.getBBox();
        const paperOffset = this.paper.el.getBoundingClientRect();
    }
  }

  private openSubComponentFormForEdit(element: joint.dia.Element): void {
    // Get the subcomponent data from the element
    const subComponentData = element.get('componentData');
    const parentComponent = this.graph.getCell(element.get('parent'));

    if (!subComponentData || !parentComponent) {
      console.error('No subcomponent data or parent component found');
      return;
    }

    // Clear existing parameters first
    while (this.subComponentParametersFormArray.length !== 0) {
      this.subComponentParametersFormArray.removeAt(0);
    }

    // Set edit mode
    this.isSubComponentEditMode = true;
    this.currentElement = element;
    this.currentParentComponent = parentComponent as joint.dia.Element;

    // Fill the form with the subcomponent data
    this.subComponentForm.patchValue({
      name: subComponentData.name || '',
      description: subComponentData.description || '',
      availability: subComponentData.availability || false,
      confidentiality: subComponentData.confidentiality || false,
      integrity: subComponentData.integrity || false,
      notes: subComponentData.notes || '',
    });

    // Add parameters if they exist
    if (subComponentData.parameters && subComponentData.parameters.length > 0) {
      subComponentData.parameters.forEach((param: any) => {
        // Extraire correctement le type de paramètre
        let parameterType = param.parameter_type;

        // Si c'est un objet, extraire le nom (ou l'ID si c'est ce qui est utilisé pour la correspondance)
        if (parameterType && typeof parameterType === 'object') {
          parameterType = parameterType.name || parameterType.id;
        }

        // Si c'est une chaîne et qu'elle ne correspond à aucun type existant, afficher un log
        if (
          typeof parameterType === 'string' &&
          this.parameterTypes.findIndex((t) => t.name === parameterType) === -1
        ) {
          console.warn(
            `Le type de paramètre '${parameterType}' n'existe pas dans la liste disponible`
          );
        }

        const paramGroup = this.fb.group({
          id: [param.id || null],
          name: [param.name || '', Validators.required],
          value: [param.value || ''],
          secret: [param.secret || false],
          parameter_type: [parameterType],
        });
        this.subComponentParametersFormArray.push(paramGroup);
      });
    }

    if (subComponentData?.images && subComponentData?.images.length > 0) {
      this.imageFiles = subComponentData.images.map(
        (image: any) => new ImageFile(image)
      );
      if (!this.imageFiles.some((image) => image.default)) {
        this.imageFiles[0].default = true;
      }
    }
    if (subComponentData.id) {
      // Fetch component details to get images
      this.diagramService
        .getSubComponentDiagramById(subComponentData.id)
        .subscribe({
          next: (subcomponent) => {},
          error: (error) => {
            console.error('Failed to load component images:', error);
          },
        });
    }

    // Show the form
    this.showSubComponentForm = true;
  }

  private openPortFormForEdit(element: joint.dia.Element): void {
    // Get the port data from the element
    const portData = element.get('componentData');
    const parentComponent = this.graph.getCell(element.get('parent'));

    if (!portData || !parentComponent) {
      console.error('No port data or parent component found');
      return;
    }

    // Clear existing parameters first
    while (this.portParametersFormArray.length !== 0) {
      this.portParametersFormArray.removeAt(0);
    }

    // Set edit mode
    this.isPortEditMode = true;
    this.currentElement = element;
    this.currentParentComponent = parentComponent as joint.dia.Element;

    // Fill the form with the port data
    this.portForm.patchValue({
      name: portData.name || '',
      description: portData.description || '',
      availability: portData.availability || false,
      confidentiality: portData.confidentiality || false,
      integrity: portData.integrity || false,
      notes: portData.notes || '',
    });

    // Add parameters if they exist
    if (portData.parameters && portData.parameters.length > 0) {
      portData.parameters.forEach((param: any) => {
        // Extraire correctement le type de paramètre
        let parameterType = param.parameter_type;

        // Si c'est un objet, extraire le nom (ou l'ID si c'est ce qui est utilisé pour la correspondance)
        if (parameterType && typeof parameterType === 'object') {
          parameterType = parameterType.name || parameterType.id;
        }

        const paramGroup = this.fb.group({
          id: [param.id || null],
          name: [param.name || '', Validators.required],
          value: [param.value || ''],
          secret: [param.secret || false],
          parameter_type: [parameterType],
        });
        this.portParametersFormArray.push(paramGroup);
      });
    }
    if (portData?.images && portData?.images.length > 0) {
      this.imageFiles = portData.images.map(
        (image: any) => new ImageFile(image)
      );
      if (!this.imageFiles.some((image) => image.default)) {
        this.imageFiles[0].default = true;
      }
    }

    if (portData.id) {
      // Fetch component details to get images
      this.diagramService.getPortDiagramById(portData.id).subscribe({
        next: (port) => {},
        error: (error) => {
          console.error('Failed to load component images:', error);
        },
      });
    }

    // Show the form
    this.showPortForm = true;
  }

  deleteComponent(): void {
    if (!this.currentElement) return;

    const backendId = this.currentElement.get('backendId');
    if (!backendId) {
      console.error('No backend ID found for this component');
      return;
    }

    if (
      confirm(
        'Are you sure you want to delete this component? This will also delete all related subcomponents, ports and interfaces.'
      )
    ) {
      this.diagramService.deleteComponent(backendId).subscribe({
        next: () => {
          console.log('Component deleted successfully');
          this.currentElement?.remove();
          this.updateDiagramVersion();
          this._menuService.getMenuList();
          this.closeComponentForm();
        },
        error: (error) => {
          console.error('Error deleting component:', error);
          alert('Failed to delete component from backend');
        },
      });
    }
  }

  deleteSubComponent(): void {
    if (!this.currentElement) return;

    const backendId = this.currentElement.get('backendId');
    if (!backendId) {
      console.error('No backend ID found for this subcomponent');
      return;
    }

    if (
      confirm(
        'Are you sure you want to delete this subcomponent? This will also delete all related interfaces.'
      )
    ) {
      // First, find all connected interfaces
      const connectedLinks = this.graph.getConnectedLinks(this.currentElement);
      const interfacePromises: Promise<any>[] = [];

      // Create deletion promises for each connected interface
      connectedLinks.forEach((link) => {
        if (link.get('type') === 'interface') {
          const interfaceId = link.get('backendId');
          if (interfaceId) {
            // Add promise to array but don't await yet
            interfacePromises.push(
              this.diagramService.deleteInterface(interfaceId).toPromise()
            );
          }
        }
      });

      // Store reference to current element before API call
      const elementToRemove = this.currentElement;

      // First delete all interfaces, then delete the subcomponent
      Promise.all(interfacePromises)
        .then(() => {
          console.log(`Deleted ${interfacePromises.length} related interfaces`);

          // Now delete the subcomponent itself
          return this.diagramService.deleteSubComponent(backendId).toPromise();
        })
        .then(() => {
          console.log('Subcomponent deleted successfully');

          // Remove all connected interfaces from the graph
          connectedLinks.forEach((link) => {
            if (link.get('type') === 'interface') {
              link.remove();
            }
          });

          // Then remove the subcomponent itself
          elementToRemove.remove();

          this.updateDiagramVersion();
          this._menuService.getMenuList();
          this.closeSubComponentForm();
        })
        .catch((error) => {
          console.error('Error during deletion process:', error);
          this._snackBar.open(
            'Failed to delete subcomponent or its interfaces',
            'Error',
            {
              duration: 3000,
            }
          );
        });
    }
  }

  deletePort(): void {
    if (!this.currentElement) return;

    const backendId = this.currentElement.get('backendId');
    if (!backendId) {
      console.error('No backend ID found for this port');
      return;
    }

    if (
      confirm(
        'Are you sure you want to delete this port? This will also delete all related interfaces.'
      )
    ) {
      this.diagramService.deletePort(backendId).subscribe({
        next: () => {
          console.log('Port deleted successfully');
          this.currentElement?.remove();
          this.updateDiagramVersion();
          this._menuService.getMenuList();
          this.closePortForm();
        },
        error: (error) => {
          console.error('Error deleting port:', error);
          alert('Failed to delete port from backend');
        },
      });
    }
  }

  deleteInterface(): void {
    // Check if we have a current element (should be a link)
    if (!this.currentElement || !this.pendingInterfaceData) return;

    const backendId = this.pendingInterfaceData.id;
    if (!backendId) {
      console.error('No backend ID found for this interface');
      return;
    }

    // No need for a confirmation prompt here as the button already indicates deletion
    this.diagramService.deleteInterface(backendId).subscribe({
      next: () => {
        console.log('Interface deleted successfully');

        // If the current element is a link, remove it
        if (
          this.currentElement &&
          this.currentElement.isLink &&
          this.currentElement.isLink()
        ) {
          this.currentElement.remove();
        } else {
          // Otherwise find the link with the matching backend ID
          const links = this.graph.getLinks();
          const interfaceLink = links.find(
            (link) => link.get('backendId') === backendId
          );
          if (interfaceLink) {
            interfaceLink.remove();
          }
        }

        // Reset all interface-related state
        this.sourcePort = null;
        this.selectedElement = null;
        this.pendingInterfaceData = null;
        this.isInterfaceEditMode = false;
        this.currentElement = null;

        this.updateDiagramVersion();
        this._menuService.getMenuList();
        this.closeInterfaceForm();
      },
      error: (error) => {
        console.error('Error deleting interface:', error);
        alert('Failed to delete interface from backend');
      },
    });
  }
  private updateSubComponentInDiagram(data: any): void {
    if (!this.currentElement) return;

    // Update visual representation
    this.currentElement.attr('label/text', data.name || 'Subcomponent');

    // Update stored data
    this.currentElement.set('componentData', data);
  }

  cancelSubComponentForm(): void {
    this.closeSubComponentForm(); // Changed from closePortForm() to closeSubComponentForm()
  }

  private updatePortInDiagram(data: any): void {
    if (!this.currentElement) return;

    // Update visual representation (port might not have a visible label)
    if (this.currentElement.attr('label/text')) {
      this.currentElement.attr('label/text', data.name || 'Port');
    }

    // Update stored data
    this.currentElement.set('componentData', data);
  }

  private closeSubComponentForm(): void {
    this.showSubComponentForm = false;
    this.isSubComponentEditMode = false; // Reset edit mode flag
    this.currentElement = null;
    this.currentParentComponent = null;
    this.pendingPosition = null;

    // Reset form
    this.subComponentForm.reset({
      name: '',
      description: '',
      availability: false,
      confidentiality: false,
      integrity: false,
      notes: '',
    });

    // Effacer les paramètres
    while (this.subComponentParametersFormArray.length !== 0) {
      this.subComponentParametersFormArray.removeAt(0);
    }
    this.imageFiles = []; // Reset image files
  }

  private closePortForm(): void {
    this.showPortForm = false;
    this.isPortEditMode = false; // Reset edit mode flag
    this.currentElement = null;
    this.currentParentComponent = null;
    this.pendingPosition = null;

    // Reset form
    this.portForm.reset({
      name: '',
      description: '',
      availability: false,
      confidentiality: false,
      integrity: false,
      notes: '',
    });

    // Effacer les paramètres
    while (this.portParametersFormArray.length !== 0) {
      this.portParametersFormArray.removeAt(0);
    }
    this.imageFiles = []; // Reset image files
  }

  cancelPortForm(): void {
    this.closePortForm();
  }

  onImageSelect(event: any) {
    const images = event.target.files;
    if (images) {
      const newImages = Array.from(images).map((file, index) => {
        const reader = new FileReader();
        const imageFile = new ImageFile({
          uploadFile: file as File,
          preview: '',
          default: this.imageFiles.length === 0 && index === 0,
        });

        reader.onload = (e: any) => {
          imageFile.preview = e.target.result;
        };
        reader.readAsDataURL(file as Blob);

        return imageFile;
      });

      this.imageFiles.push(...newImages);
    }
  }

  removeImage(index: number) {
    const removedImage = this.imageFiles[index];
    this.imageFiles.splice(index, 1);

    if (removedImage.default && this.imageFiles.length > 0) {
      this.imageFiles[0].default = true;
    }
  }

  setImageAsDefault(index: number) {
    this.imageFiles.forEach((image) => (image.default = false));
    this.imageFiles[index].default = true;
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    const targetElement = event.target as HTMLElement;
    if (
      this.showComponentForm &&
      targetElement.classList.contains('component-form-overlay')
    ) {
      this.cancelComponentForm();
    }
    if (
      this.showSubComponentForm &&
      targetElement.classList.contains('component-form-overlay')
    ) {
      this.cancelSubComponentForm();
    }
    if (
      this.showPortForm &&
      targetElement.classList.contains('component-form-overlay')
    ) {
      this.cancelPortForm();
    }
    if (
      this.showInterfaceForm &&
      targetElement.classList.contains('component-form-overlay')
    ) {
      this.cancelInterfaceForm();
    }
  }

  // Zoom control methods
  zoomIn(): void {
    if (this.zoomLevel < this.maxZoom) {
      this.zoomLevel = Math.min(this.zoomLevel + this.zoomStep, this.maxZoom);
      this.applyZoom();
    }
  }

  zoomOut(): void {
    if (this.zoomLevel > this.minZoom) {
      this.zoomLevel = Math.max(this.zoomLevel - this.zoomStep, this.minZoom);
      this.applyZoom();
    }
  }

  resetZoom(): void {
    this.zoomLevel = 1;
    this.applyZoom();
  }

  private applyZoom(): void {
    if (this.paper) {
      this.paper.scale(this.zoomLevel, this.zoomLevel);
    }
  }

  @HostListener('wheel', ['$event'])
  onMouseWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();

      if (event.deltaY < 0) {
        // Zoom in
        this.zoomIn();
      } else {
        // Zoom out
        this.zoomOut();
      }
    }
  }
  private serializeParameters(
    formData: FormData,
    parameters: any[],
    logOutput: boolean = false
  ): void {
    if (parameters && parameters.length > 0) {
      if (logOutput) {
        console.log('Parameters before serialization:', parameters);
      }
      formData.append('parameters', JSON.stringify(parameters));
      if (logOutput) {
        console.log(
          'Parameters after serialization:',
          formData.get('parameters')
        );
      }
    } else {
      formData.append('parameters', JSON.stringify([]));
    }
  }
  private serializeImages(
    formData: FormData,
    logOutput: boolean = false
  ): { uuid: string; default: number }[] {
    let images: { uuid: string; default: number }[] = [];

    this.imageFiles.forEach((image) => {
      let img = {
        uuid: image.uuid || '',
        default: image.default ? 1 : 0,
      };
      images.push(img);

      if (image.uploadFile) {
        formData.append('files', image.uploadFile);
      }
    });

    if (logOutput) {
      console.log(JSON.stringify(images));
    }

    formData.append('images', JSON.stringify(images));
    return images;
  }
  private processFormFields(
    formData: FormData,
    formValue: any,
    skipFields: string[] = ['parameters']
  ): void {
    Object.keys(formValue).forEach((key) => {
      // Skip specified fields
      if (skipFields.includes(key)) {
        return;
      }

      const value = formValue[key];
      if (typeof value === 'boolean') {
        formData.append(key, value ? '1' : '0');
      } else if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });
  }
}
