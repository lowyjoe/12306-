//初始化值
$(function(){
	mood.get();
});
//加1效果
function moodPlus(item){
		plus = $('<div id="plus" class="mood-plus">+1</div>');
		plus.css({
			top: '110px',
			left: '12px',
			fontSize: '14px',
			opacity:1
		});
		item.append(plus);
		plus.animate({
			top: '20px',fontSize: '38px',left: '2px',opacity: '0'
		},{duration:500});
}
var mood = {
	time : new Date().getTime(),
    find:function(id) {
        return $('#m_'+id);
    },
	set:function(vote_id) {
		var _this = this;
		if(this.check()) {
			/*$.getJSON(APP_URL+"?app=mood&controller=index&action=vote&contentid="+contentid+"&voteid="+vote_id+"&jsoncallback=?", function(json){
				moodPlus(_this.find(vote_id));
				_this.render(json);
				$.cookie("mood_time"+contentid, _this.time);
			});*/
			var elem=_this.find(vote_id);
			moodPlus(elem);
			var voteHeight=elem.find('.per').css('height');
			var num=Number(voteHeight.substr(0,voteHeight.indexOf("px")))+1;
			_this.render({data:[{height:num,title:num,number:num,moodid:vote_id}]});
			$.cookie("mood_time"+"contentid", _this.time);
		} else {
			alert('请勿重复提交');
		}
	},
	get:function() {
		var _this = this;
		/*$.getJSON(APP_URL+"?app=mood&controller=index&action=vote&contentid="+contentid+"&jsoncallback=?", function(json){
			_this.render(json);
		});*/
		_this.render({data:[{height:"0",title:"0",number:"0",moodid:"1"},{height:"10",title:"10",number:"10",moodid:"6"},{height:"20",title:"20",number:"20",moodid:"2"}]});
	},
	check:function() {
		//return (this.time - ($.cookie('mood_time'+"contentid")==undefined?0:$.cookie('mood_time'+"contentid"))) > 1000 * 30;
		//return  parseInt(Math.random()*2);//项目经理说要有一半的准确率    以备下次升级用
		return true;
	},
	render: function(json) {
		var self = this;
		console.log(json.data);
		$.each(json.data, function(){
			if(this.number == 0){
				this.height = 0;
			}
			console.log	(this.moodid+"         "+this.height);
            var elem = self.find(this.moodid);
            console.log(elem);
            elem.find('.per').css('height', this.height+'%');
            elem.find('.progress').attr('title', this.number);
		});
		$('.item .per').each(function(){
			if($(this).css('height') == '0%'){
				$(this).removeClass('bdper');
			}
		});
	}
};