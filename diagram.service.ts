import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { ComponentGetData, ComponentModel } from '../models/component';
import { SubcomponentGetData, SubcomponentModel } from '../models/subcomponent';
import { PortGetData, PortModel } from '../models/port';
import { InterfaceModel } from '../models/interface';
import { version } from 'jointjs';

@Injectable({
  providedIn: 'root',
})
export class DiagramService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  addComponent(data: any): Observable<ComponentModel> {
    // Just pass the data without modifying it
    console.log('Sending component data to backend:', data);
    return this.http.post<ComponentModel>(`${this.apiUrl}/component/`, data);
  }

  updateComponent(id: string, data: any): Observable<ComponentModel> {
    // Just pass the data without modifying it
    console.log('Updating component with data:', data);
    return this.http.put<ComponentModel>(
      `${this.apiUrl}/component/${id}/`,
      data
    );
  }

  deleteComponent(uuid: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/component/${uuid}/`);
  }

  addSubComponent(data: any): Observable<SubcomponentModel> {
    // Just pass the data without modifying it
    console.log('Sending component data to backend:', data);
    return this.http.post<SubcomponentModel>(
      `${this.apiUrl}/subcomponent/`,
      data
    );
  }

  updateSubComponent(id: string, data: any): Observable<SubcomponentModel> {
    // Just pass the data without modifying it
    console.log('Updating component with data:', data);
    return this.http.put<SubcomponentModel>(
      `${this.apiUrl}/subcomponent/${id}/`,
      data
    );
  }
  deleteSubComponent(uuid: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/subcomponent/${uuid}/`);
  }

  addPort(data: any): Observable<PortModel> {
    // Just pass the data without modifying it
    console.log('Sending component data to backend:', data);
    return this.http.post<PortModel>(`${this.apiUrl}/port/`, data);
  }
  updatePort(id: string, data: any): Observable<PortModel> {
    console.log('Updating port with data:', data);
    return this.http.put<PortModel>(`${this.apiUrl}/port/${id}/`, data);
  }
  deletePort(uuid: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/port/${uuid}/`);
  }

  addInterface(data: any): Observable<InterfaceModel> {
    // Just pass the data without modifying it
    console.log('Sending interface data to backend:', data);
    return this.http.post<InterfaceModel>(`${this.apiUrl}/interface/`, data);
  }
  updateInterface(id: string, data: any): Observable<InterfaceModel> {
    console.log('Updating interface with data:', data);
    return this.http.put<InterfaceModel>(
      `${this.apiUrl}/interface/${id}/`,
      data
    );
  }

  deleteInterface(uuid: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/interface/${uuid}/`);
  }

  updateElementSize(
    id: string,
    size: { width: number; height: number }
  ): Observable<any> {
    return this.http.patch(`${this.apiUrl}/element/${id}/size/`, size);
  }

  getParameterType(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/parameter-type/`);
  }
  getVersion(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/version/`);
  }

  // Method to get a specific component
  getComponentById(uuid: string): Observable<ComponentGetData> {
    return this.http.get<ComponentGetData>(`${this.apiUrl}/component/${uuid}/`);
  }

  // Method to get a specific component
  getSubComponentById(uuid: string): Observable<SubcomponentGetData> {
    return this.http.get<SubcomponentGetData>(
      `${this.apiUrl}/subcomponent/${uuid}/`
    );
  }

  // Method to get a specific component
  getPortById(uuid: string): Observable<PortGetData> {
    return this.http.get<PortGetData>(`${this.apiUrl}/port/${uuid}/`);
  }

  // Ajouter à la fin du service
  getInterfaceById(uuid: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/interface/${uuid}/`);
  }

  // Method to get a specific component
  getComponentDiagramById(uuid: string): Observable<ComponentGetData> {
    return this.http.get<ComponentGetData>(
      `${this.apiUrl}/component/${uuid}/diagram/`
    );
  }

  // Method to get a specific component
  getSubComponentDiagramById(uuid: string): Observable<SubcomponentGetData> {
    return this.http.get<SubcomponentGetData>(
      `${this.apiUrl}/subcomponent/${uuid}/diagram/`
    );
  }

  // Method to get a specific component
  getPortDiagramById(uuid: string): Observable<PortGetData> {
    return this.http.get<PortGetData>(`${this.apiUrl}/port/${uuid}/diagram/`);
  }

  // Ajouter à la fin du service
  getInterfaceDiagramById(uuid: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/interface/${uuid}/diagram/`);
  }
  getAllParameters(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/parameter/`);
  }

  getParameterById(uuid: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/parameter/${uuid}/`);
  }

  addParameter(data: any): Observable<any> {
    console.log('Sending parameter data to backend:', data);
    return this.http.post<any>(`${this.apiUrl}/parameter/`, data);
  }

  updateParameter(id: string, data: any): Observable<any> {
    console.log('Updating parameter with data:', data);
    return this.http.put<any>(`${this.apiUrl}/parameter/${id}/`, data);
  }

  deleteParameter(uuid: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/parameter/${uuid}/`);
  }
  getParametersByVersion(versionId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/parameter/?version=${versionId}`);
  }
  
  getCompleteParametersByVersion(versionId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/parameter/complete/?version=${versionId}`);
  }
}
