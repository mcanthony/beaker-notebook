!(function(app) {

  app.factory('TagsFactory', ['Restangular', function(Restangular) {
    return {
      getTags: function() {
        return Restangular.one('data_tags').getList();
      }
    }
  }]);

})(window.bunsen);