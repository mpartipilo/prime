import { types, Instance, flow } from 'mobx-state-tree';
import { JSONObject } from '../../interfaces/JSONObject';
import { ContentType } from './ContentType';
import { ContentTypeRef } from '../contentTypes';
import { client } from '../../utils/client';
import { UPDATE_CONTENT_ENTRY, PUBLISH_CONTENT_ENTRY, REMOVE_CONTENT_ENTRY, UNPUBLISH_CONTENT_ENTRY } from '../mutations';
import { Version } from './Version';

export const ContentEntry = types
  .model('ContentEntry', {
    id: types.identifier,
    entryId: types.string,
    versionId: types.string,
    contentTypeId: types.string,
    contentReleaseId: types.maybeNull(types.string),
    language: types.string,
    isPublished: types.boolean,
    contentType: types.maybeNull(ContentTypeRef),
    data: types.frozen<JSONObject>(),
    createdAt: types.Date,
    updatedAt: types.Date,
    versions: types.array(Version),
    loadedAt: types.Date,
    hasChanged: false,
  })
  .preProcessSnapshot(snapshot => {
    if (!snapshot.id) {
      snapshot.id = [snapshot.entryId, snapshot.language, snapshot.contentReleaseId].join(':');
    }
    return {
      ...snapshot,
      loadedAt: new Date(),
      contentType: snapshot.contentTypeId ? snapshot.contentTypeId : null,
      isPublished: Boolean(snapshot.isPublished),
      createdAt: new Date(snapshot.createdAt),
      updatedAt: new Date(snapshot.updatedAt),
    };
  })
  .views(self => ({
    get display() {
      if (!self.data) {
        return self.entryId;
      }
      return self.data.title || self.data.name || Object.values(self.data).shift();
    },
    get hasBeenPublished() {
      return self.versions.findIndex(v => v.isPublished) >= 0;
    }
  }))
  .actions(self => {
    const setHasChanged = (hasChanged: boolean) => {
      self.hasChanged = hasChanged;
    }

    const setContentType = (contentType: Instance<typeof ContentType>) => {
      self.contentType = contentType;
    }

    const setIsPublished = (isPublished: boolean) => {
      self.isPublished = isPublished;
    }

    const updateSelf = (data: any) => {
      if (self.versionId !== data.versionId) {
        self.versions.splice(0, 0, {
          versionId: data.versionId,
          isPublished: Boolean(data.isPublished),
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt),
        });
      } else if (self.versions.length > 0) {
        self.versions[0].isPublished = Boolean(data.isPublished);
        self.versions[0].updatedAt = new Date(data.updatedAt);
      }
      self.versionId = data.versionId;
      self.contentTypeId = data.contentTypeId;
      self.data = data.data;
      self.language = data.language;
      self.isPublished = Boolean(data.isPublished);
      self.createdAt = new Date(data.createdAt);
      self.updatedAt = new Date(data.updatedAt);
    };

    const update = flow(function*(proposedData: JSONObject) {
      const { data } = yield client.mutate({
        mutation: UPDATE_CONTENT_ENTRY,
        variables: {
          versionId: self.versionId,
          language: self.language,
          data: proposedData,
        },
      });
      if (data && data.updateContentEntry) {
        updateSelf(data.updateContentEntry);
      }
    });

    const release = flow(function*(contentReleaseId: string) {
      const { data } = yield client.mutate({
        mutation: UPDATE_CONTENT_ENTRY,
        variables: {
          versionId: self.versionId,
          contentReleaseId,
        },
      });
      if (data && data.updateContentEntry) {
        updateSelf(data.updateContentEntry);
      }
    });

    const publish = flow(function*() {
      const { data } = yield client.mutate({
        mutation: PUBLISH_CONTENT_ENTRY,
        variables: {
          versionId: self.versionId,
        },
      });
      if (data && data.publishContentEntry) {
        updateSelf(data.publishContentEntry);
      }
    });

    const unpublish = flow(function*() {
      const { data } = yield client.mutate({
        mutation: UNPUBLISH_CONTENT_ENTRY,
        variables: {
          versionId: self.versionId,
        },
      });
      if (data && data.unpublishContentEntry) {
        updateSelf(data.unpublishContentEntry);
      }
    });

    const remove = flow(function*(force = false) {
      return yield client.mutate({
        mutation: REMOVE_CONTENT_ENTRY,
        variables: {
          id: self.entryId,
          language: force ? undefined : self.language,
          contentReleaseId: force ? undefined : self.contentReleaseId,
        }
      });
    });

    return {
      setContentType,
      setHasChanged,
      setIsPublished,
      remove,
      update,
      release,
      publish,
      unpublish,
    };
  });
