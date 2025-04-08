// OpenProject API Response Types
// These interfaces define the structure of responses from the OpenProject API

/**
 * Link representation in OpenProject API
 */
interface Link {
  href: string;
  title?: string;
  templated?: boolean;
  method?: string;
}

/**
 * Links collection in OpenProject API
 */
interface Links {
  self: Link;
  [key: string]: Link;
}

/**
 * Base interface for OpenProject resources
 */
interface BaseResource {
  _type: string;
  id: string | number;
  _links: Links;
}

/**
 * Embedded resource with name and other properties
 */
interface NamedResource extends BaseResource {
  name: string;
  [key: string]: any;
}

/**
 * Work Package status representation
 */
interface Status extends NamedResource {
  _type: 'Status';
  isDefault: boolean;
  isClosed: boolean;
  color: string;
  position: number;
}

/**
 * Work Package priority representation
 */
interface Priority extends NamedResource {
  _type: 'Priority';
  position: number;
  isDefault: boolean;
  isActive: boolean;
}

/**
 * Work Package type representation
 */
interface Type extends NamedResource {
  _type: 'Type';
  color: string;
  position: number;
  isDefault: boolean;
}

/**
 * User representation
 */
interface User extends NamedResource {
  _type: 'User';
  firstName: string;
  lastName: string;
  email?: string;
  avatar?: string;
  status: string;
}

/**
 * Project representation
 */
interface Project extends NamedResource {
  _type: 'Project';
  identifier: string;
  description: {
    format: string;
    raw: string;
    html: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Text format representation (for descriptions, comments, etc.)
 */
interface FormattedText {
  format: string;
  raw: string;
  html: string;
}

/**
 * Embedded resources for a work package
 */
interface WorkPackageEmbedded {
  status?: Status;
  type?: Type;
  priority?: Priority;
  project?: Project;
  assignee?: User;
  author?: User;
  responsible?: User;
  category?: NamedResource;
  version?: NamedResource;
  description?: FormattedText;
  attachments?: {
    total: number;
    count: number;
    elements: any[];
  };
  activities?: {
    total: number;
    count: number;
    elements: any[];
  };
  watchers?: {
    total: number;
    count: number;
    elements: any[];
  };
  relations?: {
    total: number;
    count: number;
    elements: any[];
  };
  children?: {
    total: number;
    count: number;
    elements: any[];
  };
}

/**
 * Work Package representation
 */
interface WorkPackage extends BaseResource {
  _type: 'WorkPackage';
  subject: string;
  description?: {
    format: string;
    raw: string;
    html: string;
  };
  scheduleManually?: boolean;
  startDate?: string;
  dueDate?: string;
  estimatedTime?: string;
  derivedEstimatedTime?: string;
  spentTime?: string;
  percentageDone?: number;
  createdAt: string;
  updatedAt: string;
  lockVersion: number;
  _embedded: WorkPackageEmbedded;
}

/**
 * Available statuses response
 */
interface AvailableStatusesResponse {
  _type: 'Collection';
  total: number;
  count: number;
  _embedded: {
    elements: Status[];
  };
  _links: Links;
}

/**
 * Collection response for any resource type
 */
interface CollectionResponse<T> {
  _type: 'Collection';
  total: number;
  count: number;
  pageSize: number;
  offset: number;
  _embedded: {
    elements: T[];
  };
  _links: Links;
}

/**
 * Attachment representation
 */
interface Attachment extends BaseResource {
  _type: 'Attachment';
  fileName: string;
  fileSize: number;
  description: FormattedText;
  status: string;
  contentType: string;
  digest: {
    algorithm: string;
    hash: string;
  };
  createdAt: string;
}

/**
 * Attachment collection response
 */
interface AttachmentCollectionResponse {
  _type: 'Collection';
  total: number;
  count: number;
  _embedded: {
    elements: Attachment[];
  };
  _links: Links;
}

/**
 * Error response from OpenProject API
 */
interface ErrorResponse {
  _type: 'Error';
  errorIdentifier: string;
  message: string;
  _embedded?: {
    details?: {
      attribute: string;
      message: string;
    }[];
  };
}

export type {
  Link,
  Links,
  BaseResource,
  NamedResource,
  Status,
  Priority,
  Type,
  User,
  Project,
  FormattedText,
  WorkPackageEmbedded,
  WorkPackage,
  AvailableStatusesResponse,
  CollectionResponse,
  Attachment,
  AttachmentCollectionResponse,
  ErrorResponse
};